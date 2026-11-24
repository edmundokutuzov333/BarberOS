-- Synthetic fixtures only. Always rolled back; no production records are modified.
begin;
select set_config('barberos.qa.owner',gen_random_uuid()::text,true);
select set_config('barberos.qa.manager',gen_random_uuid()::text,true);
select set_config('barberos.qa.barber',gen_random_uuid()::text,true);
select set_config('barberos.qa.outsider',gen_random_uuid()::text,true);
select set_config('barberos.qa.shop',gen_random_uuid()::text,true);
select set_config('barberos.qa.other',gen_random_uuid()::text,true);
select set_config('barberos.qa.professional',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select v::uuid,v||'@example.invalid','{}'::jsonb from unnest(array[
 current_setting('barberos.qa.owner'),current_setting('barberos.qa.manager'),
 current_setting('barberos.qa.barber'),current_setting('barberos.qa.outsider')]) v;
insert into public.barbershops(id,slug,name,status)
select v::uuid,'role-boundary-'||v,'Role boundary QA','trial'
from unnest(array[current_setting('barberos.qa.shop'),current_setting('barberos.qa.other')]) v;
insert into public.barbershop_members(barbershop_id,user_id,role) values
(current_setting('barberos.qa.shop')::uuid,current_setting('barberos.qa.owner')::uuid,'owner'),
(current_setting('barberos.qa.shop')::uuid,current_setting('barberos.qa.manager')::uuid,'manager'),
(current_setting('barberos.qa.shop')::uuid,current_setting('barberos.qa.barber')::uuid,'barber'),
(current_setting('barberos.qa.other')::uuid,current_setting('barberos.qa.outsider')::uuid,'owner');
insert into public.barbers(id,barbershop_id,user_id,display_name)
values(current_setting('barberos.qa.professional')::uuid,current_setting('barberos.qa.shop')::uuid,current_setting('barberos.qa.barber')::uuid,'QA professional');
-- Explicit data prevents an empty fixture from making an authorization test pass.
select set_config('barberos.qa.order',gen_random_uuid()::text,true);
select set_config('barberos.qa.product',gen_random_uuid()::text,true);
insert into public.shop_products(id,barbershop_id,name,is_active)
values(current_setting('barberos.qa.product')::uuid,current_setting('barberos.qa.shop')::uuid,'Role fixture product',false);
insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,is_active)
values(current_setting('barberos.qa.shop')::uuid,current_setting('barberos.qa.product')::uuid,'Unit',1000,false);
insert into public.shop_products(barbershop_id,name,is_active)
values(current_setting('barberos.qa.other')::uuid,'Outside fixture product',false);
do $fixture$
declare v_service uuid; v_customer uuid; v_appointment uuid; s uuid:=current_setting('barberos.qa.shop')::uuid;
begin
  insert into public.services(barbershop_id,name,price_cents,duration_min,is_active)
    values(s,'QA service',10000,30,true) returning id into v_service;
  insert into public.customers(barbershop_id,name,phone)
    values(s,'QA customer','+258841234567') returning id into v_customer;
  insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
    values(s,current_setting('barberos.qa.professional')::uuid,v_service,v_customer,now()+interval '10 days',now()+interval '10 days 30 minutes',30,10000,'confirmed')
    returning id into v_appointment;
  insert into public.appointment_product_orders(id,barbershop_id,appointment_id,status)
    values(current_setting('barberos.qa.order')::uuid,s,v_appointment,'received');
end;
$fixture$;
select set_config('request.jwt.claim.sub',current_setting('barberos.qa.manager'),true);
set local role authenticated;
do $manager$
declare s uuid:=current_setting('barberos.qa.shop')::uuid; b uuid:=current_setting('barberos.qa.professional')::uuid;
begin
  if (select count(*) from public.shop_products where id=current_setting('barberos.qa.product')::uuid)<>1 then
    raise exception 'MANAGER_CATALOG_NOT_VISIBLE';
  end if;
  perform count(*) from public.shop_product_categories where barbershop_id=s;
  perform count(*) from public.shop_product_variants where barbershop_id=s;
  perform count(*) from public.inventory_movements where barbershop_id=s;
  perform count(*) from public.payments where barbershop_id=s;
  if not exists(
    select 1 from jsonb_array_elements(public.get_shop_order_queue(s)) o
      cross join lateral jsonb_array_elements(o->'assignees') a
    where o->>'id'=current_setting('barberos.qa.order')
      and a->>'user_id'=current_setting('barberos.qa.barber')
      and not (a ? 'email')
  ) then raise exception 'MANAGER_QUEUE_ASSIGNEE_MISSING_OR_EXPOSED'; end if;
  if exists(select 1 from jsonb_array_elements(public.get_shop_order_queue(s)) o
      cross join lateral jsonb_array_elements(o->'assignees') a
      where a->>'user_id'=current_setting('barberos.qa.outsider') or a ? 'email')
  then raise exception 'QUEUE_ASSIGNEE_DIRECTORY_LEAK'; end if;
  perform public.update_shop_order_operation(s,current_setting('barberos.qa.order')::uuid,'assign',null,current_setting('barberos.qa.barber')::uuid);
  if (select assigned_to from public.appointment_product_orders where id=current_setting('barberos.qa.order')::uuid)
     is distinct from current_setting('barberos.qa.barber')::uuid then raise exception 'MANAGER_ASSIGNMENT_NOT_PERSISTED'; end if;
  begin
    perform public.save_barber(s,b,'QA professional',null,0,null,null,'{}'::uuid[]);
    raise exception 'MANAGER_ACCOUNT_UNLINK_ALLOWED';
  exception when insufficient_privilege then
    if sqlerrm<>'OWNER_REQUIRED' then raise; end if;
  end;
  begin
    update public.barbers set user_id=null where id=b;
    raise exception 'MANAGER_DIRECT_UNLINK_ALLOWED';
  exception when insufficient_privilege then
    if sqlerrm<>'OWNER_REQUIRED' then raise; end if;
  end;
  perform public.save_barber(s,b,'QA professional edited',null,0,null,current_setting('barberos.qa.barber')::uuid,'{}'::uuid[]);
  if exists(select 1 from public.shop_products where barbershop_id=current_setting('barberos.qa.other')::uuid) then
    raise exception 'MANAGER_CROSS_TENANT_CATALOG_VISIBLE';
  end if;
  begin
    perform public.list_members(s);
    raise exception 'MANAGER_FULL_DIRECTORY_ALLOWED';
  exception when others then if sqlerrm<>'OWNER_REQUIRED' then raise; end if; end;
end;
$manager$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.qa.barber'),true);
set local role authenticated;
do $barber$
begin
  if exists(select 1 from public.shop_product_variants) then raise exception 'BARBER_INTERNAL_CATALOG_VISIBLE'; end if;
  if (select count(*) from public.barbers where id=current_setting('barberos.qa.professional')::uuid)<>1 then raise exception 'BARBER_OWN_RECORD_MISSING'; end if;
end;
$barber$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.qa.owner'),true);
set local role authenticated;
do $owner$
declare s uuid:=current_setting('barberos.qa.shop')::uuid; b uuid:=current_setting('barberos.qa.professional')::uuid; m uuid;
begin
  if (select count(*) from public.shop_products where id=current_setting('barberos.qa.product')::uuid)<>1 then
    raise exception 'OWNER_CATALOG_NOT_VISIBLE';
  end if;
  perform public.save_barber(s,b,'QA professional',null,0,null,current_setting('barberos.qa.barber')::uuid,'{}'::uuid[]);
  select id into strict m from public.list_members(s) where user_id=current_setting('barberos.qa.barber')::uuid;
  perform public.remove_barbershop_member(s,m);
  if exists(select 1 from public.barbers where id=b and user_id is not null) then raise exception 'REMOVED_MEMBER_STILL_LINKED'; end if;
end;
$owner$;
reset role;
rollback;
select 'LIVE_ROLE_BOUNDARIES_PASSED' as result;
