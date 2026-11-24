// Only runs in the disposable local Supabase CI project. No remote credentials.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
const project=process.env.BARBEROS_LOCAL_PROJECT_ID??'';
assert.match(project,/^barberos_ci_[0-9]+_[0-9]+$/,'Local CI project required');
const config=JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const url=new URL(config.API_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Refuse non-local API');
assert.ok(config.ANON_KEY&&config.SERVICE_ROLE_KEY,'Local keys unavailable');
const root=url.origin;
const db='supabase_db_'+project;
function sql(query){
 return execFileSync('docker',['exec','-i',db,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
const uuid=x=>{assert.match(x,/^[0-9a-f-]{36}$/i);return "'"+x+"'::uuid";};
async function request(path,body,token,method='POST'){
 const res=await fetch(root+path,{method,headers:{'apikey':config.ANON_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 let result;try{result=await res.json();}catch{result=null;}
 return {status:res.status,result};
}
const users=[];
const shop=randomUUID();
async function fixture(admin){
 const email='simulator-'+randomUUID()+'@example.com',password=randomBytes(24).toString('hex');
 const created=await request('/auth/v1/admin/users',{email,password,email_confirm:true},config.SERVICE_ROLE_KEY);
 assert.ok(created.status===200||created.status===201,'Local fixture creation failed: '+created.status);
 const id=created.result.id??created.result.user?.id;users.push(id);
 sql("insert into public.profiles(id,full_name,is_platform_admin,password_change_required) values("+uuid(id)+",'Payment acceptance fixture',"+admin+",false) on conflict(id) do update set is_platform_admin="+admin+",password_change_required=false;");
 const signed=await request('/auth/v1/token?grant_type=password',{email,password},config.ANON_KEY);
 assert.equal(signed.status,200,'Local fixture sign-in failed');
 assert.ok(signed.result?.access_token,'No local session');
 return {id,token:signed.result.access_token};
}
async function call(token,action,payload={}){
 return request('/functions/v1/payment-simulator',{action,payload},token);
}
function ok(response){
 assert.equal(response.status,200,'Unexpected simulator HTTP status: '+response.status+' / '+(response.result?.error??'no response'));
 assert.equal(response.result?.ok,true);return response.result.data;
}
let previousGate;
try{
 previousGate=sql('select enabled from private.payment_simulator_settings where singleton;');
 assert.equal(previousGate,'f','Simulator default must fail closed');
 const actor=await fixture(true),other=await fixture(true),nonadmin=await fixture(false);
 sql("insert into public.barbershops(id,name,slug,status) values("+uuid(shop)+",'Simulator HTTP fixture','sim-http-"+shop+"','trial');");
 const before=sql("select (select count(*) from public.payments)||':'||(select count(*) from public.shop_order_payments)||':'||(select count(*) from public.appointments)||':'||(select value::text from public.platform_settings where key='payments');");
 let response;
 // First request may compile the local Edge bundle. Retry only safe reads.
 for(let i=0;i<5;i++){try{response=await call(actor.token,'availability');if(response.status===200)break;}catch{/* cold start */}await new Promise(r=>setTimeout(r,1000));}
 assert.equal(ok(response).enabled,false);
 sql('update private.payment_simulator_settings set enabled=true where singleton;');
 assert.equal(ok(await call(actor.token,'availability')).enabled,true);
 assert.equal((await call(nonadmin.token,'list')).status,403);
 assert.equal((await call(config.ANON_KEY,'list')).status,401);
 const payload={request_id:randomUUID(),shop_id:shop,purpose:'deposit',scenario:'timeout',amount_minor:25050};
 // Real concurrent HTTP calls through the Edge Function and PostgREST.
 const creates=await Promise.all(Array.from({length:8},()=>call(actor.token,'create',payload)));
 const runs=creates.map(ok);const run=runs[0];
 assert.equal(new Set(runs.map(r=>r.id)).size,1);assert.equal(run.events.length,1);
 assert.equal(run.real_money,false);
 assert.equal((await call(actor.token,'create',{...payload,amount_minor:25051})).status,400);
 assert.equal(ok(await call(other.token,'list')).runs.length,0);
 assert.equal((await call(other.token,'confirm',{run_id:run.id,request_id:randomUUID()})).status,404);
 const confirm={run_id:run.id,request_id:randomUUID()};
 const confirmations=(await Promise.all(Array.from({length:6},()=>call(actor.token,'confirm',confirm)))).map(ok);
 assert.ok(confirmations.every(r=>r.status==='pending'&&r.outcome==='TIMEOUT'&&r.events.length===2));
 const reconciled=ok(await call(actor.token,'reconcile',{run_id:run.id,request_id:randomUUID()}));
 assert.equal(reconciled.status,'paid');assert.equal(reconciled.entitlement,'confirmed');
 const refund=ok(await call(actor.token,'refund',{run_id:run.id,request_id:randomUUID()}));
 assert.equal(refund.status,'refunded');
 const replay=ok(await call(actor.token,'replay',{run_id:run.id,request_id:randomUUID()}));
 assert.equal(replay.status,'refunded');assert.equal(replay.events.at(-1).outcome,'DUPLICATE_IGNORED');
 const listed=ok(await call(actor.token,'list'));assert.equal(listed.runs.length,1);assert.equal(listed.runs[0].id,run.id);
 const after=sql("select (select count(*) from public.payments)||':'||(select count(*) from public.shop_order_payments)||':'||(select count(*) from public.appointments)||':'||(select value::text from public.platform_settings where key='payments');");
 assert.equal(after,before,'Operational data changed during simulator acceptance');
 console.log('PASS | Real local authenticated Edge HTTP, PostgreSQL, concurrent idempotency, authorization, reconciliation and live isolation');
}finally{
 if(previousGate==='f')sql('update private.payment_simulator_settings set enabled=false where singleton;');
 sql('delete from public.barbershops where id='+uuid(shop)+';');
 for(const id of users)await request('/auth/v1/admin/users/'+id,undefined,config.SERVICE_ROLE_KEY,'DELETE');
}
