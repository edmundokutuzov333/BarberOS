-- Rollback-only acceptance with an isolated admin and tenant.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); s uuid; s2 uuid; key uuid; event_key uuid;
  item jsonb; replay jsonb; payload jsonb; scenario text; expected text; denied boolean;
  before_pay bigint; before_orders bigint; before_appointments bigint; gate jsonb;
begin
  select count(*) into before_pay from public.payments;
  select count(*) into before_orders from public.shop_order_payments;
  select count(*) into before_appointments from public.appointments;
  select value into gate from public.platform_settings ps where ps.key='payments';
  insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated',a||'@sim.invalid'),(b,'authenticated','authenticated',b||'@sim.invalid');
  insert into public.profiles(id,full_name,is_platform_admin,password_change_required) values(a,'Simulator fixture',true,false),(b,'Other fixture',true,false)
    on conflict(id) do update set is_platform_admin=true,password_change_required=false;
  insert into public.barbershops(name,slug,status) values('Simulator fixture','sim-'||a,'trial') returning id into s;
  insert into public.barbershops(name,slug,status) values('Simulator fixture 2','sim-'||b,'trial') returning id into s2;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  update private.payment_simulator_settings set enabled=false;
  if public.payment_simulator('availability','{}')->>'enabled'<>'false' then raise exception 'FAIL default gate'; end if;
  update private.payment_simulator_settings set enabled=true;
  if has_function_privilege('anon','public.payment_simulator(text,jsonb)','EXECUTE') or
    has_table_privilege('authenticated','private.payment_simulator_runs','SELECT') or
    has_table_privilege('authenticated','private.payment_simulator_events','INSERT') then raise exception 'FAIL grants'; end if;
  foreach scenario in array array['success','insufficient_funds','cancelled','invalid_number','pending','timeout','duplicate_callback','late_success','provider_error'] loop
    key:=gen_random_uuid();
    payload:=jsonb_build_object('request_id',key,'shop_id',s,'purpose','deposit','scenario',scenario,'amount_minor',25000);
    item:=public.payment_simulator('create',payload);
    replay:=public.payment_simulator('create',payload);
    if item->>'id'<>replay->>'id' or jsonb_array_length(replay->'events')<>1 or item->>'real_money'<>'false' then raise exception 'FAIL create replay %',scenario; end if;
    denied:=false;
    begin perform public.payment_simulator('create',payload||'{"amount_minor":25001}'); exception when sqlstate '22023' then denied:=true; end;
    if not denied then raise exception 'FAIL conflicting request'; end if;
    event_key:=gen_random_uuid();
    payload:=jsonb_build_object('run_id',item->>'id','request_id',event_key);
    item:=public.payment_simulator('confirm',payload);
    replay:=public.payment_simulator('confirm',payload);
    if item<>replay then raise exception 'FAIL event replay'; end if;
    expected:=case when scenario in ('pending','timeout','provider_error') then 'pending'
      when scenario in ('insufficient_funds','cancelled','invalid_number') then 'failed' else 'paid' end;
    if item->>'status'<>expected then raise exception 'FAIL confirm %: %',scenario,item; end if;
    if expected='pending' then
      item:=public.payment_simulator('reconcile',payload||jsonb_build_object('request_id',gen_random_uuid()));
      if item->>'status'<>(case when scenario='provider_error' then 'failed' else 'paid' end) then raise exception 'FAIL reconcile %',scenario; end if;
    end if;
    if scenario='late_success' and item->>'entitlement'<>'refund_required' then raise exception 'FAIL late payment'; end if;
    if scenario='duplicate_callback' and jsonb_array_length(item->'events')<>3 then raise exception 'FAIL callback dedup'; end if;
    if item->>'status'='paid' then
      item:=public.payment_simulator('refund',payload||jsonb_build_object('request_id',gen_random_uuid()));
      if item->>'status'<>'refunded' or item->>'entitlement'<>'reversed' then raise exception 'FAIL refund'; end if;
    end if;
    replay:=public.payment_simulator('replay',payload||jsonb_build_object('request_id',gen_random_uuid()));
    if replay->>'status'<>item->>'status' then raise exception 'FAIL terminal replay'; end if;
  end loop;
  foreach scenario in array array['service','product','subscription'] loop
    item:=public.payment_simulator('create',jsonb_build_object('request_id',gen_random_uuid(),'shop_id',s2,'purpose',scenario,'scenario','success','amount_minor',1));
    if item->>'purpose'<>scenario or item->>'shop_id'<>s2::text then raise exception 'FAIL purpose'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  if jsonb_array_length(public.payment_simulator('list','{}')->'runs')<>0 then raise exception 'FAIL actor isolation'; end if;
  denied:=false;
  begin perform public.payment_simulator('confirm',jsonb_build_object('run_id',item->>'id','request_id',gen_random_uuid())); exception when sqlstate 'P0002' then denied:=true; end;
  if not denied then raise exception 'FAIL cross actor mutation'; end if;
  update public.profiles set is_platform_admin=false where id=b;
  denied:=false;
  begin perform public.payment_simulator('list','{}'); exception when others then if sqlerrm like '%PLATFORM_ADMIN_REQUIRED%' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'FAIL non-admin'; end if;
  if before_pay<>(select count(*) from public.payments) or before_orders<>(select count(*) from public.shop_order_payments)
    or before_appointments<>(select count(*) from public.appointments)
    or gate is distinct from (select value from public.platform_settings ps where ps.key='payments') then raise exception 'FAIL live isolation'; end if;
  raise notice 'PASS payment simulator: nine scenarios, four purposes, idempotency, refund, replay, actor isolation, live isolation';
end $$;
rollback;
