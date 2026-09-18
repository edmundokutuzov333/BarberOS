begin;

do $$
declare
  v_processing boolean;
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
begin
  select exists (
    select 1 from pg_enum e
    join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='notif_status' and e.enumlabel='processing'
  ) into v_processing;

  if not v_processing then raise exception 'FAIL: processing status missing'; end if;

  select has_function_privilege('anon','public.claim_notifications(integer)','execute'),
         has_function_privilege('authenticated','public.claim_notifications(integer)','execute'),
         has_function_privilege('service_role','public.claim_notifications(integer)','execute')
  into v_anon,v_auth,v_service;

  if v_anon or v_auth or not v_service then
    raise exception 'FAIL: claim_notifications grants invalid';
  end if;

  select has_table_privilege('anon','public.notifications','select')
      or has_table_privilege('anon','public.notifications','insert')
      or has_table_privilege('anon','public.notifications','update')
      or has_table_privilege('anon','public.notifications','delete'),
    has_table_privilege('authenticated','public.notifications','select')
      or has_table_privilege('authenticated','public.notifications','insert')
      or has_table_privilege('authenticated','public.notifications','update')
      or has_table_privilege('authenticated','public.notifications','delete')
  into v_anon,v_auth;

  if v_anon or v_auth then
    raise exception 'FAIL: direct notification DML/SELECT grants still enabled';
  end if;
end $$;

do $$
declare
  v_shop uuid;
  v_appt uuid;
  v_notification uuid;
  v_claim record;
  v_failure record;
  v_sent public.notif_status;
  v_attempts integer;
  v_retry timestamp with time zone;
begin
  select id into v_shop from public.barbershops order by created_at limit 1;
  select id into v_appt from public.appointments order by created_at desc limit 1;
  if v_shop is null then raise exception 'FAIL: no real barbershop fixture'; end if;

  update public.notifications
  set scheduled_for=now()+interval '7 days'
  where status='queued';

  insert into public.notifications(
    barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
  )
  values(
    v_shop,v_appt,'whatsapp','appointment_confirmed','+258841234567',now()-interval '1 second','{"fixture":true}'::jsonb
  )
  returning id into v_notification;

  select * into v_claim
  from public.claim_notifications(1)
  where id=v_notification;

  if v_claim.id is null or v_claim.status is distinct from 'processing' or v_claim.attempts <> 1 then
    raise exception 'FAIL: atomic claim did not move fixture to processing';
  end if;

  select * into v_failure
  from public.mark_notification_failure(v_notification,'provider_timeout',true,'https://wa.me/258841234567?text=retry');

  if v_failure.status is distinct from 'queued'
     or v_failure.attempts <> 1
     or v_failure.retry_at is null
     or v_failure.retry_at <= now() then
    raise exception 'FAIL: retry transition invalid';
  end if;

  update public.notifications
  set next_attempt_at=now()-interval '1 second'
  where id=v_notification;

  select * into v_claim
  from public.claim_notifications(1)
  where id=v_notification;

  if v_claim.id is null or v_claim.attempts <> 2 or v_claim.status is distinct from 'processing' then
    raise exception 'FAIL: second claim/backoff invalid';
  end if;

  v_sent := public.mark_notification_sent(v_notification,'provider-message-1','{"delivered_channel":"whatsapp"}'::jsonb);

  if v_sent is distinct from 'sent' then
    raise exception 'FAIL: sent transition invalid';
  end if;

  if not exists (
    select 1 from public.notifications
    where id=v_notification
      and status='sent'
      and provider_message_id='provider-message-1'
      and (payload->>'delivered_channel')='whatsapp'
  ) then
    raise exception 'FAIL: sent metadata not persisted';
  end if;

  delete from public.notifications where id=v_notification;

  insert into public.notifications(
    barbershop_id,channel,template_key,recipient,scheduled_for,status,attempts,last_attempt_at
  )
  values(
    v_shop,'whatsapp','appointment_confirmed','+258841234567',now(),
    'processing',1,now()-interval '20 minutes'
  )
  returning id into v_notification;

  if public.recover_stuck_notifications(interval '10 minutes') <> 1 then
    raise exception 'FAIL: stuck processing recovery count invalid';
  end if;

  if not exists (
    select 1 from public.notifications
    where id=v_notification and status='queued' and next_attempt_at is not null
  ) then
    raise exception 'FAIL: stuck processing was not requeued';
  end if;

  update public.notifications
  set status='processing', attempts=5, last_attempt_at=now()-interval '20 minutes'
  where id=v_notification;

  perform public.recover_stuck_notifications(interval '10 minutes');

  if not exists (
    select 1 from public.notifications
    where id=v_notification and status='failed'
  ) then
    raise exception 'FAIL: max-attempt processing was not failed';
  end if;

  delete from public.notifications where id=v_notification;
end $$;

rollback;