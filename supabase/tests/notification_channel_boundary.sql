-- Enqueue only inside rollback. No notification is visible to a dispatcher and
-- no provider is contacted; synthetic recipients use the reserved invalid domain.
begin;
do $test$
declare
  shop uuid:=gen_random_uuid(); barber uuid:=gen_random_uuid(); service uuid:=gen_random_uuid();
  customer uuid:=gen_random_uuid(); appt uuid:=gen_random_uuid(); r record;
begin
  if not private.channel_enabled('email') or private.channel_enabled('whatsapp') then raise exception 'NOTIFICATION_CHANNEL_DEFAULTS_INVALID'; end if;
  insert into public.barbershops(id,slug,name,status) values(shop,'channels-'||replace(shop::text,'-',''),'Channel fixture','trial');
  insert into public.barbers(id,barbershop_id,display_name) values(barber,shop,'Fixture barber');
  insert into public.services(id,barbershop_id,name,price_cents,duration_min) values(service,shop,'Fixture service',10000,30);
  insert into public.customers(id,barbershop_id,name,phone,email) values(customer,shop,'Fixture customer','+258841234567','channel-fixture@example.invalid');
  insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
    values(appt,shop,barber,service,customer,now()+interval '90 days',now()+interval '90 days 30 minutes',30,10000,'confirmed');
  perform public.enqueue_appointment_notifications(appt);
  if (select count(*) from public.notifications n where n.barbershop_id=shop and n.appointment_id=appt and n.channel='email' and n.status='queued' and n.template_key in('appointment_confirmed','reminder_24h','reminder_1h'))<>3 then raise exception 'EMAIL_CONFIRMATION_REMINDERS_MISSING'; end if;
  if exists(select 1 from public.notifications n where n.barbershop_id=shop and n.channel='whatsapp') then raise exception 'DISABLED_WHATSAPP_PRODUCED'; end if;
  -- Legacy producers are protected too, independently of the enqueue function.
  insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(shop,appt,'whatsapp','appointment_cancelled','+258841234567',now(),'{}') returning * into r;
  if r.status<>'skipped' or r.error<>'CHANNEL_DISABLED' then raise exception 'LEGACY_DISABLED_CHANNEL_NOT_SKIPPED'; end if;
  if has_function_privilege('authenticated','public.enqueue_appointment_notifications(uuid)','EXECUTE')
    or has_function_privilege('anon','public.enqueue_appointment_notifications(uuid)','EXECUTE') then raise exception 'NOTIFICATION_ENQUEUE_EXPOSED'; end if;
end;
$test$;
rollback;
select 'NOTIFICATION_CHANNEL_BOUNDARY_PASSED' as result;
