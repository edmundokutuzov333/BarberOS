-- Synthetic tenants only. Every fixture and role change is transaction-scoped.
-- No payment RPC, provider call or committed business-data mutation.
begin;
do $fixture$
declare
  owner_id uuid:=gen_random_uuid(); barber_user uuid:=gen_random_uuid();
  shop_id uuid:=gen_random_uuid(); other_shop uuid:=gen_random_uuid();
  barber_a uuid:=gen_random_uuid(); barber_b uuid:=gen_random_uuid();
  service_id uuid:=gen_random_uuid(); haircut_id uuid:=gen_random_uuid(); customer_id uuid:=gen_random_uuid();
begin
  perform set_config('barberos.report_owner',owner_id::text,true);
  perform set_config('barberos.report_barber_user',barber_user::text,true);
  perform set_config('barberos.report_shop',shop_id::text,true);
  perform set_config('barberos.report_other_shop',other_shop::text,true);
  perform set_config('barberos.report_barber_a',barber_a::text,true);
  perform set_config('barberos.report_barber_b',barber_b::text,true);
  insert into auth.users(id,email,raw_user_meta_data)
    values(owner_id,owner_id||'@example.invalid','{}'),(barber_user,barber_user||'@example.invalid','{}');
  insert into public.barbershops(id,slug,name,status,timezone)
    values(shop_id,'report-'||replace(shop_id::text,'-',''),'Report fixture','trial','Africa/Maputo'),
          (other_shop,'report-'||replace(other_shop::text,'-',''),'Other report fixture','trial','Africa/Maputo');
  insert into public.barbershop_members(barbershop_id,user_id,role)
    values(shop_id,owner_id,'owner'),(shop_id,barber_user,'barber');
  insert into public.barbers(id,barbershop_id,user_id,display_name)
    values(barber_a,shop_id,barber_user,'Barber A'),(barber_b,shop_id,null,'Barber B');
  insert into public.services(id,barbershop_id,name,price_cents,duration_min)
    values(service_id,shop_id,'Report service',10000,30);
  insert into public.haircuts(id,barbershop_id,service_id,name)
    values(haircut_id,shop_id,service_id,'Report haircut');
  insert into public.customers(id,barbershop_id,name,phone)
    values(customer_id,shop_id,'Report customer','+258841234567');
  insert into public.working_hours(barbershop_id,weekday,opens_at,closes_at)
    values(shop_id,extract(dow from date '2035-06-14')::integer,'09:00','17:00');
  -- Overlapping global/barber blocks must be unioned, never double-subtracted.
  insert into public.time_blocks(barbershop_id,barber_id,starts_at,ends_at)
    values(shop_id,null,'2035-06-14 10:00+02','2035-06-14 11:00+02'),
          (shop_id,barber_a,'2035-06-14 10:30+02','2035-06-14 11:30+02');
  insert into public.appointments(barbershop_id,barber_id,service_id,haircut_id,customer_id,starts_at,ends_at,duration_min,price_cents,status,completed_at)
    values(shop_id,barber_a,service_id,haircut_id,customer_id,'2035-06-14 09:00+02','2035-06-14 09:30+02',30,10000,'confirmed',null),
          (shop_id,barber_b,service_id,haircut_id,customer_id,'2035-06-14 09:00+02','2035-06-14 09:45+02',45,20000,'completed','2035-06-14 09:45+02');
end;
$fixture$;
select set_config('request.jwt.claim.sub',current_setting('barberos.report_owner'),true);
set local role authenticated;
do $owner$
declare r record; rejected boolean:=false;
begin
  select * into strict r from public.get_report_summary(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14');
  if r.appointment_count<>2 or r.completed_count<>1 or r.estimated_revenue_cents<>20000 or r.booked_minutes<>75 or r.capacity_minutes<>810 then
    raise exception 'REPORT_SUMMARY_AGGREGATION_FAILED';
  end if;
  select * into strict r from public.get_report_daily(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14');
  if r.appointment_count<>2 or r.capacity_minutes<>810 or r.estimated_revenue_cents<>20000 then raise exception 'REPORT_DAILY_FAILED'; end if;
  select * into strict r from public.get_report_services(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14');
  if r.completed_count<>1 or r.estimated_revenue_cents<>20000 then raise exception 'REPORT_SERVICES_FAILED'; end if;
  select * into strict r from public.get_report_haircuts(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14');
  if r.appointment_count<>2 or r.estimated_revenue_cents<>20000 then raise exception 'REPORT_HAIRCUTS_FAILED'; end if;
  if (select count(*) from public.get_report_barbers(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14'))<>2 then raise exception 'REPORT_BARBERS_FAILED'; end if;
  begin
    perform public.get_report_summary(current_setting('barberos.report_other_shop')::uuid,'2035-06-14','2035-06-14');
  exception when others then if sqlerrm='SHOP_OPERATOR_REQUIRED' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'REPORT_CROSS_TENANT_ALLOWED'; end if;
  begin
    perform public.get_report_daily(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-13');
    raise exception 'REPORT_INVERTED_RANGE_ALLOWED';
  exception when others then if sqlerrm<>'INVALID_DATE_RANGE' then raise; end if; end;
  begin
    perform public.get_report_summary(current_setting('barberos.report_shop')::uuid,'2035-01-01','2036-01-03');
    raise exception 'REPORT_EXCESSIVE_RANGE_ALLOWED';
  exception when others then if sqlerrm<>'REPORT_RANGE_TOO_LARGE' then raise; end if; end;
end;
$owner$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.report_barber_user'),true);
set local role authenticated;
do $barber$
declare r record;
begin
  -- An explicit other-barber filter cannot widen a barber's own scope.
  select * into strict r from public.get_report_summary(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14',current_setting('barberos.report_barber_b')::uuid);
  if r.appointment_count<>1 or r.completed_count<>0 or r.capacity_minutes<>390 or r.estimated_revenue_cents<>0 then raise exception 'REPORT_BARBER_SCOPE_FAILED'; end if;
  if exists(select 1 from public.get_report_barbers(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14') where barber_id<>current_setting('barberos.report_barber_a')::uuid) then raise exception 'REPORT_OTHER_BARBER_LEAKED'; end if;
end;
$barber$;
reset role;
set local role anon;
do $anonymous$
begin
  begin
    perform public.get_report_summary(current_setting('barberos.report_shop')::uuid,'2035-06-14','2035-06-14');
    raise exception 'REPORT_ANONYMOUS_ALLOWED';
  exception when insufficient_privilege then null; end;
end;
$anonymous$;
reset role;
rollback;
select 'REPORTING_BOUNDARY_PASSED' as result;
