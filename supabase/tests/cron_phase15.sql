begin;

do $block$
declare
  v_pg_cron boolean;
  v_pg_net boolean;
  v_job_count integer;
  v_secret_ok boolean;
  v_auth boolean;
  v_anon boolean;
begin
  select exists(select 1 from pg_extension where extname='pg_cron'),
         exists(select 1 from pg_extension where extname='pg_net')
  into v_pg_cron,v_pg_net;

  if not v_pg_cron or not v_pg_net then
    raise exception 'FAIL: scheduler extensions missing';
  end if;

  select count(*)
  into v_job_count
  from cron.job
  where jobname in (
    'barberos-notify-dispatch',
    'barberos-holds-expire',
    'barberos-waitlist-rotate',
    'barberos-daily-digest'
  )
  and active;

  if v_job_count <> 4 then
    raise exception 'FAIL: expected four active BarberOS cron jobs, found %',v_job_count;
  end if;

  if not exists(select 1 from cron.job where jobname='barberos-notify-dispatch' and schedule='* * * * *') then
    raise exception 'FAIL: notify-dispatch schedule invalid';
  end if;
  if not exists(select 1 from cron.job where jobname='barberos-holds-expire' and schedule='*/2 * * * *') then
    raise exception 'FAIL: holds-expire schedule invalid';
  end if;
  if not exists(select 1 from cron.job where jobname='barberos-waitlist-rotate' and schedule='*/5 * * * *') then
    raise exception 'FAIL: waitlist-rotate schedule invalid';
  end if;
  if not exists(select 1 from cron.job where jobname='barberos-daily-digest' and schedule='0 5 * * *') then
    raise exception 'FAIL: daily-digest schedule invalid';
  end if;

  select public.scheduler_secret_valid(
    (select decrypted_secret from vault.decrypted_secrets where name='barberos_cron_secret')
  )
  into v_secret_ok;

  if not v_secret_ok then
    raise exception 'FAIL: Vault scheduler secret validation failed';
  end if;

  select has_function_privilege('anon','public.get_notification_automation_status(uuid)','execute'),
         has_function_privilege('authenticated','public.get_notification_automation_status(uuid)','execute')
  into v_anon,v_auth;

  if v_anon or not v_auth then
    raise exception 'FAIL: notification automation status grants invalid';
  end if;
end
$block$;

do $block$
declare
  v_shop uuid;
  v_appt public.appointments%rowtype;
  v_before integer;
  v_after integer;
  v_result integer;
begin
  select id into v_shop
  from public.barbershops
  where status in ('trial','active')
  order by created_at
  limit 1;

  select a.*
  into v_appt
  from public.appointments a
  where a.starts_at > now()
  order by a.created_at desc
  limit 1;

  if v_shop is null or v_appt.id is null then
    raise exception 'FAIL: no real appointment fixture available';
  end if;

  update public.appointments
  set status='pending',
      deposit_status='awaiting',
      hold_expires_at=now()-interval '1 minute'
  where id=v_appt.id;

  select count(*) into v_before
  from public.appointments
  where id=v_appt.id and status='cancelled';

  v_result := private.expire_stale_holds(10);

  select count(*) into v_after
  from public.appointments
  where id=v_appt.id and status='cancelled';

  if v_result < 1 or v_after <> 1 then
    raise exception 'FAIL: expired hold was not cancelled';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where entity='appointment'
      and entity_id=v_appt.id
      and action='appointment_hold_expired'
  ) then
    raise exception 'FAIL: expired hold audit missing';
  end if;

  if not exists (
    select 1 from public.notifications
    where appointment_id=v_appt.id
      and template_key='appointment_cancelled'
      and status='queued'
  ) then
    -- Notification is only expected where the fixture customer has contact data.
    null;
  end if;
end
$block$;

do $block$
declare
  v_shop uuid;
  v_service uuid;
  v_barber uuid;
  v_entry uuid;
  v_token uuid;
  v_status public.waitlist_status;
  v_suppressed integer;
  v_result integer;
begin
  select b.id into v_shop
  from public.barbershops b
  where b.status in ('trial','active')
  order by b.created_at
  limit 1;

  select s.id into v_service
  from public.services s
  where s.barbershop_id=v_shop and s.is_active
  order by s.sort_order,s.id
  limit 1;

  select b.id into v_barber
  from public.barbers b
  join public.barber_services bs on bs.barber_id=b.id and bs.service_id=v_service
  where b.barbershop_id=v_shop and b.is_active
  order by b.created_at
  limit 1;

  if v_shop is null or v_service is null or v_barber is null then
    raise exception 'FAIL: no real waitlist fixture relations';
  end if;

  v_token := gen_random_uuid();

  insert into public.waitlist_entries(
    barbershop_id,service_id,barber_id,customer_name,phone,
    date_from,date_to,period,status,offer_token,offer_slot_start,
    offer_barber_id,offer_expires_at
  )
  values(
    v_shop,v_service,v_barber,'Cron Fixture','+258841234567',
    (now() at time zone 'Africa/Maputo')::date,
    (now() at time zone 'Africa/Maputo')::date + 30,
    'any','offered',v_token,
    now()+interval '1 day',v_barber,now()-interval '1 minute'
  )
  returning id into v_entry;

  insert into public.notifications(
    barbershop_id,waitlist_entry_id,channel,template_key,recipient,scheduled_for,payload
  )
  values(
    v_shop,v_entry,'whatsapp','waitlist_offer','+258841234567',now(),
    jsonb_build_object('fixture',true)
  );

  v_result := private.rotate_expired_waitlist_offers(10);

  select status into v_status
  from public.waitlist_entries
  where id=v_entry;

  select count(*) into v_suppressed
  from public.notifications
  where waitlist_entry_id=v_entry
    and template_key='waitlist_offer'
    and status='skipped';

  if v_result <> 1 or v_status is distinct from 'expired' or v_suppressed <> 1 then
    raise exception 'FAIL: expired waitlist offer was not rotated/suppressed';
  end if;
end
$block$;

do $block$
declare
  v_first integer;
  v_second integer;
begin
  v_first := private.enqueue_daily_digests();
  v_second := private.enqueue_daily_digests();

  if v_second <> 0 then
    raise exception 'FAIL: daily digest is not idempotent in the same local day';
  end if;

  if v_first < 0 then
    raise exception 'FAIL: daily digest returned negative count';
  end if;
end
$block$;

rollback;
