-- BarberOS Phase 15: scheduler jobs, Vault secrets and temporal domain work.

do $do$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='barberos_project_url') then
    perform vault.create_secret('https://alseiinjzwjdiwtvkdzy.supabase.co','barberos_project_url','Supabase project URL',null);
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name='barberos_publishable_key') then
    perform vault.create_secret('sb_publishable_Cjn-g6cWrIUSYVI5oeK2ZA_Ipk0B5ID','barberos_publishable_key','Supabase publishable key for cron invocation',null);
  end if;

  if not exists (select 1 from vault.decrypted_secrets where name='barberos_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text,'barberos_cron_secret','Private scheduler authentication secret',null);
  end if;
end
$do$;

create or replace function public.scheduler_secret_valid(p_candidate text)
returns boolean
language sql
security definer
set search_path=''
as $function$
  select p_candidate is not null
    and p_candidate <> ''
    and exists (
      select 1
      from vault.decrypted_secrets
      where name='barberos_cron_secret'
        and decrypted_secret=p_candidate
    );
$function$;

revoke all on function public.scheduler_secret_valid(text)
from public,anon,authenticated;
grant execute on function public.scheduler_secret_valid(text) to service_role;

create or replace function private.expire_stale_holds(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,100),500));
  v_count integer := 0;
  a public.appointments%rowtype;
  c public.customers%rowtype;
begin
  for a in
    select x.*
    from public.appointments x
    where x.status='pending'
      and x.deposit_status='awaiting'
      and x.hold_expires_at is not null
      and x.hold_expires_at <= now()
    order by x.hold_expires_at,x.id
    for update skip locked
    limit v_limit
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('barber-booking:' || a.barber_id::text,0)
    );

    select *
    into a
    from public.appointments x
    where x.id=a.id
      and x.status='pending'
      and x.deposit_status='awaiting'
      and x.hold_expires_at is not null
      and x.hold_expires_at <= now()
    for update;

    if not found then
      continue;
    end if;

    select *
    into c
    from public.customers
    where id=a.customer_id
      and barbershop_id=a.barbershop_id;

    update public.notifications
    set status='skipped',
        error='appointment_hold_expired'
    where appointment_id=a.id
      and status='queued'
      and template_key in ('appointment_pending','reminder_24h','reminder_1h');

    update public.appointments x
    set status='cancelled',
        cancelled_at=now(),
        cancel_reason='deposit_timeout',
        hold_expires_at=null
    where x.id=a.id;

    if c.phone is not null then
      insert into public.notifications(
        barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
      )
      values(
        a.barbershop_id,a.id,'whatsapp','appointment_cancelled',c.phone,now(),
        jsonb_build_object(
          'manage_token',a.manage_token,
          'starts_at',a.starts_at,
          'cancel_reason','deposit_timeout'
        )
      );
    end if;

    if c.email is not null then
      insert into public.notifications(
        barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
      )
      values(
        a.barbershop_id,a.id,'email','appointment_cancelled',c.email,now(),
        jsonb_build_object(
          'manage_token',a.manage_token,
          'starts_at',a.starts_at,
          'cancel_reason','deposit_timeout'
        )
      );
    end if;

    insert into public.audit_logs(
      barbershop_id,actor_id,action,entity,entity_id,diff
    )
    values(
      a.barbershop_id,null,'appointment_hold_expired','appointment',a.id,
      jsonb_build_object(
        'starts_at',a.starts_at,
        'hold_expires_at',a.hold_expires_at,
        'deposit_cents',a.deposit_cents
      )
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function private.expire_stale_holds(integer)
from public,anon,authenticated;

create or replace function private.rotate_expired_waitlist_offers(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,100),500));
  v_count integer := 0;
  w record;
begin
  for w in
    select id,offer_token
    from public.waitlist_entries
    where status='offered'
      and offer_token is not null
      and offer_expires_at is not null
      and offer_expires_at <= now()
    order by offer_expires_at,id
    for update skip locked
    limit v_limit
  loop
    perform public.expire_waitlist_offer(w.offer_token);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function private.rotate_expired_waitlist_offers(integer)
from public,anon,authenticated;

create or replace function private.enqueue_daily_digests()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer := 0;
  s public.barbershops%rowtype;
  r record;
  v_local_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_today_total integer;
  v_today_confirmed integer;
  v_today_completed integer;
  v_today_no_show integer;
  v_pending_deposits integer;
  v_waiting integer;
  v_revenue integer;
begin
  for s in
    select *
    from public.barbershops
    where status in ('trial','active')
      and coalesce(timezone,'Africa/Maputo')='Africa/Maputo'
  loop
    v_local_date := (now() at time zone s.timezone)::date;
    v_start := v_local_date::text::timestamp at time zone s.timezone;
    v_end := (v_local_date + 1)::text::timestamp at time zone s.timezone;

    if exists (
      select 1
      from public.notifications n
      where n.barbershop_id=s.id
        and n.template_key='daily_digest'
        and n.channel='email'
        and n.scheduled_for >= v_start
        and n.scheduled_for < v_end
        and n.status <> 'skipped'
    ) then
      continue;
    end if;

    select count(*)::int into v_today_total
    from public.appointments a
    where a.barbershop_id=s.id
      and a.starts_at >= v_start
      and a.starts_at < v_end
      and a.status <> 'cancelled';

    select count(*)::int into v_today_confirmed
    from public.appointments a
    where a.barbershop_id=s.id
      and a.starts_at >= v_start
      and a.starts_at < v_end
      and a.status='confirmed';

    select count(*)::int into v_today_completed
    from public.appointments a
    where a.barbershop_id=s.id
      and a.starts_at >= v_start
      and a.starts_at < v_end
      and a.status='completed';

    select count(*)::int into v_today_no_show
    from public.appointments a
    where a.barbershop_id=s.id
      and a.starts_at >= v_start
      and a.starts_at < v_end
      and a.status='no_show';

    select count(*)::int into v_pending_deposits
    from public.appointments a
    where a.barbershop_id=s.id
      and a.status='pending'
      and a.deposit_status='awaiting'
      and a.hold_expires_at is not null
      and a.hold_expires_at > now();

    select count(*)::int into v_waiting
    from public.waitlist_entries w
    where w.barbershop_id=s.id
      and w.status='waiting';

    select coalesce(sum(a.price_cents),0)::int into v_revenue
    from public.appointments a
    where a.barbershop_id=s.id
      and a.starts_at >= v_start
      and a.starts_at < v_end
      and a.status in ('pending','confirmed','in_progress','completed');

    for r in
      select m.user_id, u.email
      from public.barbershop_members m
      join auth.users u on u.id=m.user_id
      where m.barbershop_id=s.id
        and m.role in ('owner','manager')
        and u.email is not null
    loop
      insert into public.notifications(
        barbershop_id,channel,template_key,recipient,scheduled_for,payload
      )
      values(
        s.id,'email','daily_digest',r.email,now(),
        jsonb_build_object(
          'local_date',v_local_date,
          'today_total',v_today_total,
          'today_confirmed',v_today_confirmed,
          'today_completed',v_today_completed,
          'today_no_show',v_today_no_show,
          'pending_deposits',v_pending_deposits,
          'waitlist_waiting',v_waiting,
          'revenue_cents',v_revenue
        )
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$function$;

revoke all on function private.enqueue_daily_digests()
from public,anon,authenticated;

do $do$
declare
  r record;
begin
  for r in
    select jobid from cron.job
    where jobname in (
      'barberos-notify-dispatch',
      'barberos-holds-expire',
      'barberos-waitlist-rotate',
      'barberos-daily-digest'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$do$;

select cron.schedule(
  'barberos-notify-dispatch',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='barberos_project_url')
        || '/functions/v1/notify-dispatch',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='barberos_publishable_key'),
        'x-barberos-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='barberos_cron_secret')
      ),
      body := jsonb_build_object('limit',50)
    ) as request_id;
  $cron$
);

select cron.schedule(
  'barberos-holds-expire',
  '*/2 * * * *',
  $cron$
    select private.expire_stale_holds(100);
  $cron$
);

select cron.schedule(
  'barberos-waitlist-rotate',
  '*/5 * * * *',
  $cron$
    select private.rotate_expired_waitlist_offers(100);
  $cron$
);

select cron.schedule(
  'barberos-daily-digest',
  '0 5 * * *',
  $cron$
    select private.enqueue_daily_digests();
  $cron$
);

comment on function public.scheduler_secret_valid(text)
is 'Validates the private scheduler token stored in Supabase Vault. Service role only.';

comment on function private.expire_stale_holds(integer)
is 'Cancels expired deposit holds transactionally, queues cancellation notices and triggers waitlist release through the appointment status transition.';

comment on function private.rotate_expired_waitlist_offers(integer)
is 'Expires lapsed waitlist offers and immediately rotates each released slot to the next eligible customer.';

comment on function private.enqueue_daily_digests()
is 'Queues one daily email digest per Owner/Manager for active Maputo shops.';
