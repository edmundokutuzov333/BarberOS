// Real authenticated tests in the disposable local CI project only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
const project=process.env.BARBEROS_LOCAL_PROJECT_ID??'';
assert.match(project,/^barberos_ci_[0-9]+_[0-9]+$/);
const cfg=JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const url=new URL(cfg.API_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
const db='supabase_db_'+project;
function sql(query){return execFileSync('docker',['exec','-i',db,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim()}
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid"};
const users=[],shop=randomUUID(),other=randomUUID(),customer=randomUUID(),otherCustomer=randomUUID();
async function request(path,body,token,method='POST'){
 const res=await fetch(url.origin+path,{method,headers:{apikey:cfg.ANON_KEY,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 return {status:res.status,data:await res.json().catch(()=>null)};
}
async function user(role){
 const email='intel-'+randomUUID()+'@example.com',password=randomBytes(24).toString('hex');
 const created=await request('/auth/v1/admin/users',{email,password,email_confirm:true},cfg.SERVICE_ROLE_KEY);
 assert.ok([200,201].includes(created.status));
 const id=created.data.id??created.data.user?.id;users.push(id);
 sql("insert into public.profiles(id,full_name,is_platform_admin,password_change_required) values("+q(id)+",'Intelligence QA',false,false) on conflict(id) do update set password_change_required=false;");
 if(role)sql("insert into public.barbershop_members(barbershop_id,user_id,role) values("+q(shop)+","+q(id)+",'"+role+"');");
 const session=await request('/auth/v1/token?grant_type=password',{email,password},cfg.ANON_KEY);
 assert.equal(session.status,200);assert.ok(session.data.access_token);return {id,token:session.data.access_token};
}
const payload={shopId:shop,days:7,topic:'overview'};
const call=(token,body=payload)=>request('/functions/v1/barber-intelligence',body,token);
const ok=res=>{assert.equal(res.status,200,JSON.stringify({status:res.status,error:res.data?.error}));assert.equal(res.data.version,1);return res.data};
try{
 sql("insert into public.barbershops(id,name,slug,status,timezone,shop_enabled) values("+q(shop)+",'Intelligence QA','intel-"+shop+"','trial','Africa/Maputo',false),("+q(other)+",'Other QA','intel-"+other+"','trial','Africa/Maputo',false);");
 sql("insert into public.customers(id,barbershop_id,name,phone) values("+q(customer)+","+q(shop)+",'QA Customer','+258840000011'),("+q(otherCustomer)+","+q(other)+",'Other QA','+258840000012');");
 const owner=await user('owner'),manager=await user('manager'),barber=await user('barber'),outsider=await user(null);
 let initial;
 for(let i=0;i<4;i++){try{initial=await call(owner.token);if(initial.status===200)break}catch{}await new Promise(r=>setTimeout(r,1000))}
 assert.equal(ok(initial).metrics.completed,0);
 assert.equal(ok(await call(manager.token)).metrics.completed,0);
 assert.equal((await call(barber.token)).status,403);
 assert.equal((await call(outsider.token)).status,403);
 assert.equal((await call()).status,401);
 assert.equal((await call(owner.token,{...payload,shopId:other})).status,403);
 assert.equal((await call(owner.token,{...payload,days:8})).status,400);
 const plan=ok(await call(owner.token,{...payload,action:'operations'}));assert.equal(plan.days.length,7);assert.equal(plan.campaign,null);
 const draft=ok(await call(manager.token,{...payload,action:'draft',kind:'feedback'}));assert.equal(draft.kind,'feedback');assert.ok(draft.body);
 assert.equal((await call(barber.token,{...payload,action:'draft',kind:'feedback'})).status,403);
 assert.equal((await call(owner.token,{...payload,action:'draft',kind:'__proto__'})).status,400);
 const reviews=ok(await call(owner.token,{...payload,action:'reviews'}));assert.equal(reviews.sampleCount,0);assert.equal(reviews.average,null);
 assert.equal((await call(barber.token,{...payload,action:'reviews'})).status,403);
 assert.equal((await call(owner.token,{...payload,action:'inventory',shopId:other})).status,403);
 assert.equal(sql('select shop_enabled from public.barbershops where id='+q(shop)+';'),'f');
 assert.equal((await call(manager.token,{...payload,action:'inventory'})).status,409);
 sql("begin; select set_config('request.jwt.claim.role','service_role',true); update public.barbershops set shop_enabled=true where id="+q(shop)+"; commit;");
 assert.equal(sql('select shop_enabled from public.barbershops where id='+q(shop)+';'),'t');
 const inventory=ok(await call(manager.token,{...payload,action:'inventory'}));assert.equal(inventory.trackedCount,0);assert.equal(inventory.rows.length,0);
 assert.equal((await call(barber.token,{...payload,action:'inventory'})).status,403);
 const finances=ok(await call(manager.token,{...payload,action:'finance'}));assert.equal(finances.revenue,0);assert.equal(finances.ticket,null);assert.equal(finances.afterCommission,0);
 assert.equal((await call(barber.token,{...payload,action:'finance'})).status,403);
 assert.equal((await call(manager.token,{...payload,action:'finance',shopId:other})).status,403);
 const c={...payload,action:'customer',customerId:customer};
 const result=ok(await call(owner.token,c));assert.equal(result.returnStatus,'insufficient');assert.equal(result.draft,null);
 assert.equal((await call(manager.token,c)).status,200);
 assert.equal((await call(barber.token,c)).status,403);
 assert.equal((await call(owner.token,{...c,customerId:otherCustomer})).status,404);
 sql("update public.profiles set password_change_required=true where id="+q(manager.id)+";");
 assert.equal((await call(manager.token)).status,403);
 sql("delete from public.barbershop_members where barbershop_id="+q(shop)+" and user_id="+q(owner.id)+";");
 assert.equal((await call(owner.token)).status,403);
 console.log('PASS | management intelligence authenticated roles, tenant isolation, password rotation, customer scope and empty history');
}finally{
 sql("delete from public.barbershops where id in ("+q(shop)+","+q(other)+");");
 for(const id of users)await request('/auth/v1/admin/users/'+id,undefined,cfg.SERVICE_ROLE_KEY,'DELETE');
}
