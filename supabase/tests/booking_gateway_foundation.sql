-- Database prerequisites of the public HTTP gateway, without creating a booking
-- through the gateway or contacting any external/payment provider.
begin;
do $catalog$
begin
  if to_regclass('private.rate_limits') is null or to_regclass('public.booking_idempotency') is null then raise exception 'GATEWAY_STORAGE_MISSING'; end if;
  if not (select relrowsecurity from pg_class where oid='public.booking_idempotency'::regclass) then raise exception 'GATEWAY_CACHE_RLS_MISSING'; end if;
  if has_table_privilege('anon','public.booking_idempotency','SELECT') or has_table_privilege('authenticated','public.booking_idempotency','SELECT') then raise exception 'GATEWAY_CACHE_EXPOSED'; end if;
  if not has_table_privilege('service_role','public.booking_idempotency','SELECT') then raise exception 'GATEWAY_CACHE_SERVER_READ_MISSING'; end if;
  if has_function_privilege('anon','public.rate_limit_consume(text,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.rate_limit_consume(text,integer,integer)','EXECUTE') then raise exception 'GATEWAY_RATE_LIMIT_EXPOSED'; end if;
  if not has_function_privilege('service_role','public.rate_limit_consume(text,integer,integer)','EXECUTE') then raise exception 'GATEWAY_RATE_LIMIT_SERVER_ACCESS_MISSING'; end if;
  if has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE') then raise exception 'GATEWAY_BOOKING_RPC_EXPOSED'; end if;
end;
$catalog$;
set local role service_role;
do $rate$
declare bucket text:='foundation-'||gen_random_uuid(); r record;
begin
  select * into strict r from public.rate_limit_consume(bucket,2,60);
  if not r.allowed or r.remaining<>1 or r.retry_after_seconds not between 1 and 60 then raise exception 'GATEWAY_RATE_FIRST_FAILED'; end if;
  select * into strict r from public.rate_limit_consume(bucket,2,60);
  if not r.allowed or r.remaining<>0 then raise exception 'GATEWAY_RATE_SECOND_FAILED'; end if;
  select * into strict r from public.rate_limit_consume(bucket,2,60);
  if r.allowed or r.remaining<>0 then raise exception 'GATEWAY_RATE_LIMIT_NOT_ENFORCED'; end if;
end;
$rate$;
reset role;
do $expiry$
declare
  shop uuid:=gen_random_uuid(); barber uuid:=gen_random_uuid(); service uuid:=gen_random_uuid();
  customer uuid:=gen_random_uuid(); appt uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
  start_at timestamptz:=now()+interval '90 days'; actual public.appointments%rowtype;
begin
  insert into public.barbershops(id,slug,name,status) values(shop,'gateway-'||replace(shop::text,'-',''),'Gateway fixture','trial');
  insert into public.barbers(id,barbershop_id,display_name) values(barber,shop,'Fixture barber');
  insert into public.services(id,barbershop_id,name,price_cents,duration_min) values(service,shop,'Fixture service',10000,30);
  insert into public.customers(id,barbershop_id,name,phone) values(customer,shop,'Fixture customer','+258841234567');
  insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status,manage_token)
    values(appt,shop,barber,service,customer,start_at,start_at+interval '30 minutes',30,10000,'confirmed',token);
  select * into strict actual from public.appointments where id=appt;
  if actual.manage_token<>token or actual.manage_token_expires_at is distinct from actual.ends_at+interval '30 days' then raise exception 'GATEWAY_DEFAULT_EXPIRY_FAILED'; end if;
  update public.appointments set manage_token_expires_at=start_at+interval '1 day' where id=appt;
  update public.appointments set ends_at=start_at+interval '45 minutes',duration_min=45 where id=appt;
  select * into strict actual from public.appointments where id=appt;
  if actual.manage_token<>token or actual.manage_token_expires_at is distinct from start_at+interval '1 day' then raise exception 'GATEWAY_EXPLICIT_EXPIRY_OVERWRITTEN'; end if;
end;
$expiry$;
rollback;
select 'BOOKING_GATEWAY_FOUNDATION_PASSED' as result;
