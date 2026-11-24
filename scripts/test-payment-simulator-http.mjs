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
const checkoutShop='f86dc636-68ed-40ba-8a42-ce64fa0806d1';
const checkoutPlan=randomUUID(), checkoutBookingKey=randomUUID();
let checkoutFixture=false;
async function fixture(admin){
 const email='simulator-'+randomUUID()+'@example.com',password=randomBytes(24).toString('hex');
 const created=await request('/auth/v1/admin/users',{email,password,email_confirm:true},config.SERVICE_ROLE_KEY);
 assert.ok(created.status===200||created.status===201,'Local fixture creation failed: '+created.status);
 const id=created.result.id??created.result.user?.id;users.push(id);
 sql("insert into public.profiles(id,full_name,is_platform_admin,password_change_required) values("+uuid(id)+",'Payment acceptance fixture',"+admin+",false) on conflict(id) do update set is_platform_admin="+admin+",password_change_required=false;");
 const signed=await request('/auth/v1/token?grant_type=password',{email,password},config.ANON_KEY);
 assert.equal(signed.status,200,'Local fixture sign-in failed');
 assert.ok(signed.result?.access_token,'No local session');
 return {id,token:signed.result.access_token,email,password};
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
 const direct=await request('/rest/v1/rpc/payment_simulator',{p_action:'list',p_payload:{}},nonadmin.token);
 assert.ok(direct.status>=400,'Direct RPC must reject non-admin');
 const unauthenticatedRpc=await request('/rest/v1/rpc/payment_simulator',{p_action:'list',p_payload:{}},config.ANON_KEY);
 assert.ok(unauthenticatedRpc.status>=400,'Anonymous direct RPC must be blocked');
 for(const amount of [0,-1,2500001,1.5,'25000',null]){
  assert.equal((await call(actor.token,'create',{request_id:randomUUID(),shop_id:shop,purpose:'deposit',scenario:'success',amount_minor:amount})).status,400);
 }
 assert.equal((await call(actor.token,'create',{request_id:'bad-uuid',shop_id:shop,purpose:'deposit',scenario:'success',amount_minor:1})).status,400);
 assert.equal((await call(actor.token,'unknown')).status,400);
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
 if(process.env.BARBEROS_SIMULATOR_BROWSER==='1'){
  // Real booking Edge creates the hold. Staff progression and partial delivery
  // are fixtures in this disposable database, not commercial mutations.
  const svc=randomUUID(),barber=randomUUID(),product=randomUUID(),variant=randomUUID(),ord=randomUUID();
  sql("insert into public.plans(id,code,name,price_cents,max_barbers,features,is_active) values("+uuid(checkoutPlan)+",'checkout-"+checkoutPlan+"','QA checkout plan',150000,5,'{}',true);");
  checkoutFixture=true;
  sql("insert into public.barbershops(id,slug,name,status,plan_id) values("+uuid(checkoutShop)+",'shop-phase8-preview-qa','Operational QA fixture','active',"+uuid(checkoutPlan)+");");
  sql("insert into private.payment_checkout_test_shops(shop_id) values("+uuid(checkoutShop)+"); update public.barbershops set deposit_enabled=true,deposit_value=20 where id="+uuid(checkoutShop)+";");
  sql("insert into public.services(id,barbershop_id,name,price_cents,duration_min,is_active,requires_deposit) values("+uuid(svc)+","+uuid(checkoutShop)+",'QA service',10000,30,true,true); insert into public.barbers(id,barbershop_id,display_name,is_active) values("+uuid(barber)+","+uuid(checkoutShop)+",'QA barber',true); insert into public.barber_services(barber_id,service_id) values("+uuid(barber)+","+uuid(svc)+"); insert into public.working_hours(barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed) select "+uuid(checkoutShop)+","+uuid(barber)+",n,time '09:00',time '12:00',false from generate_series(0,6)n;");
  const start=sql("select min(slot_start) from public.get_composed_available_slots('shop-phase8-preview-qa',"+uuid(svc)+","+uuid(barber)+",(now() at time zone 'Africa/Maputo')::date+3,null,'{}'::uuid[]);");
  assert.ok(start,'QA booking must expose a slot');
  const booking=await request('/functions/v1/booking-create',{idempotency_key:checkoutBookingKey,p_slug:'shop-phase8-preview-qa',p_service_id:svc,p_haircut_id:null,p_barber_id:barber,p_start:new Date(start).toISOString(),p_name:'Checkout QA fixture',p_phone:'840000018',p_email:null,p_shop_items:[],p_addon_ids:[],p_expected_price:10000,p_expected_duration:30},config.ANON_KEY);
  assert.equal(booking.status,200,'Real booking Edge failed: '+(booking.result?.error??'unknown'));
  assert.equal(booking.result.booking.deposit_cents,2000);assert.equal(booking.result.booking.needs_payment,true);
  const token=booking.result.booking.manage_token;
  const appointment=sql("select id from public.appointments where manage_token="+uuid(token)+";");
  const operational={
   token,
   readAppointment:()=>sql("select status::text||':'||deposit_status::text from public.appointments where id="+uuid(appointment)+";"),
   completeAndDeliver:()=>{
    sql("update public.appointments set status='completed',completed_at=now() where id="+uuid(appointment)+";");
    sql("insert into public.shop_products(id,barbershop_id,name,product_kind,track_stock,is_active) values("+uuid(product)+","+uuid(checkoutShop)+",'QA product','takeaway',false,false); insert into public.shop_product_variants(id,barbershop_id,product_id,label,unit_label,price_minor,is_active) values("+uuid(variant)+","+uuid(checkoutShop)+","+uuid(product)+",'QA','unidade',1000,true); insert into public.appointment_product_orders(id,barbershop_id,appointment_id,status) values("+uuid(ord)+","+uuid(checkoutShop)+","+uuid(appointment)+",'partially_delivered'); insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,delivered_qty,options,line_total_snapshot,status) values("+uuid(checkoutShop)+","+uuid(ord)+","+uuid(product)+","+uuid(variant)+",'QA product','QA',1000,4,3,'{}',4000,'partially_delivered');");
   },
   readSettlement:(purpose)=>JSON.parse(sql("select jsonb_build_object('amount',amount_minor,'status',status,'outcome',outcome) from private.payment_checkout_runs where shop_id="+uuid(checkoutShop)+" and purpose='"+purpose+"' order by created_at desc limit 1;")),
  };
  assert.equal(operational.readAppointment(),'pending:awaiting');
  const {certifyPaymentBrowser}=await import('../frontend/tests/payment-simulator-real-browser.mjs');
  await certifyPaymentBrowser({apiUrl:root,anonKey:config.ANON_KEY,actor,nonadmin,shop,operational,readRun:id=>JSON.parse(sql("select jsonb_build_object('status',r.status,'amount_minor',r.amount_minor,'purpose',r.purpose,'entitlement',r.simulated_entitlement,'event_count',(select count(*) from private.payment_simulator_events e where e.run_id=r.id)) from private.payment_simulator_runs r where r.id="+uuid(id)+';'))});
 }
 if(checkoutFixture){sql('delete from public.booking_idempotency where key='+uuid(checkoutBookingKey)+'; delete from public.barbershops where id='+uuid(checkoutShop)+'; delete from public.plans where id='+uuid(checkoutPlan)+';');checkoutFixture=false;}
 // Re-check authoritative permissions using the same still-valid JWT.
 sql("update public.profiles set password_change_required=true where id="+uuid(other.id)+";");
 assert.equal((await call(other.token,'list')).status,403);
 sql("update public.profiles set password_change_required=false,is_platform_admin=false where id="+uuid(other.id)+";");
 assert.equal((await call(other.token,'list')).status,403);
 // Browser logout revokes the actor's sessions. Verify the old session is
 // rejected, then use a legitimate fresh local login for the gate test.
 let gateToken=actor.token;
 if(process.env.BARBEROS_SIMULATOR_BROWSER==='1'){
  assert.equal((await call(actor.token,'availability')).status,401);
  const fresh=await request('/auth/v1/token?grant_type=password',{email:actor.email,password:actor.password},config.ANON_KEY);
  assert.equal(fresh.status,200,'Fresh local sign-in after logout failed');
  assert.ok(fresh.result?.access_token,'Fresh session missing');
  gateToken=fresh.result.access_token;
 }
 // The feature gate must reject mutations even for a valid administrator.
 sql('update private.payment_simulator_settings set enabled=false where singleton;');
 assert.equal(ok(await call(gateToken,'availability')).enabled,false);
 assert.equal((await call(gateToken,'create',{...payload,request_id:randomUUID()})).status,403);
 sql('update private.payment_simulator_settings set enabled=true where singleton;');
 const after=sql("select (select count(*) from public.payments)||':'||(select count(*) from public.shop_order_payments)||':'||(select count(*) from public.appointments)||':'||(select value::text from public.platform_settings where key='payments');");
 assert.equal(after,before,'Operational data changed during simulator acceptance');
 console.log('PASS | Real local authenticated Edge HTTP, PostgreSQL, concurrent idempotency, authorization, reconciliation and live isolation');
}finally{
 if(checkoutFixture)sql('delete from public.booking_idempotency where key='+uuid(checkoutBookingKey)+'; delete from public.barbershops where id='+uuid(checkoutShop)+'; delete from public.plans where id='+uuid(checkoutPlan)+';');
 if(previousGate==='f')sql('update private.payment_simulator_settings set enabled=false where singleton;');
 sql('delete from public.barbershops where id='+uuid(shop)+';');
 for(const id of users)await request('/auth/v1/admin/users/'+id,undefined,config.SERVICE_ROLE_KEY,'DELETE');
}
