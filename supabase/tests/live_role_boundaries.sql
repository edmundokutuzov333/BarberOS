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
select set_config('request.jwt.claim.sub',current_setting('barberos.qa.manager'),true);
set local role authenticated;
do $manager$
declare s uuid:=current_setting('barberos.qa.shop')::uuid; b uuid:=current_setting('barberos.qa.professional')::uuid;
begin
  perform count(*) from public.shop_products where barbershop_id=s;
  perform count(*) from public.shop_product_categories where barbershop_id=s;
  perform count(*) from public.shop_product_variants where barbershop_id=s;
  perform count(*) from public.inventory_movements where barbershop_id=s;
  perform count(*) from public.payments where barbershop_id=s;
  perform public.get_shop_order_queue(s);
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
  perform public.save_barber(s,b,'QA professional',null,0,null,current_setting('barberos.qa.barber')::uuid,'{}'::uuid[]);
  select id into strict m from public.list_members(s) where user_id=current_setting('barberos.qa.barber')::uuid;
  perform public.remove_barbershop_member(s,m);
  if exists(select 1 from public.barbers where id=b and user_id is not null) then raise exception 'REMOVED_MEMBER_STILL_LINKED'; end if;
end;
$owner$;
reset role;
rollback;
select 'LIVE_ROLE_BOUNDARIES_PASSED' as result;
