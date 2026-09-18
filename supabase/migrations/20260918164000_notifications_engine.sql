-- BarberOS Phase 14: Notifications Engine
-- Durable dispatcher state, retry policy, secure operator read model and provider delivery boundary.

alter type public.notif_status add value if not exists 'processing';

alter table public.notifications
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists fallback_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.notifications'::regclass
      and conname='notifications_attempts_nonnegative'
  ) then
    alter table public.notifications
      add constraint notifications_attempts_nonnegative check (attempts >= 0);
  end if;
end $$;

create index if not exists notifications_dispatch_due_idx
  on public.notifications(status, scheduled_for, next_attempt_at, id)
  where status in ('queued','processing');

create index if not exists notifications_shop_status_idx
  on public.notifications(barbershop_id, status, scheduled_for desc);

create index if not exists notifications_appointment_idx
  on public.notifications(appointment_id, status)
  where appointment_id is not null;

create index if not exists notifications_waitlist_idx
  on public.notifications(waitlist_entry_id, status)
  where waitlist_entry_id is not null;

-- Only the server-side dispatcher may change delivery state.
revoke select, insert, update, delete, truncate on public.notifications from anon, authenticated;

create or replace function public.claim_notifications(
  p_limit integer default 25
)
returns table(
  id uuid,
  barbershop_id uuid,
  appointment_id uuid,
  waitlist_entry_id uuid,
  channel public.notif_channel,
  template_key text,
  recipient text,
  payload jsonb,
  scheduled_for timestamptz,
  attempts integer,
  customer_name text,
  customer_phone text,
  customer_email text,
  service_name text,
  haircut_name text,
  barber_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  price_cents integer,
  duration_min integer,
  shop_name text,
  shop_slug text,
  shop_phone text,
  shop_whatsapp text,
  timezone text,
  manage_token uuid,
  offer_token uuid,
  offer_expires_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,25),100));
begin
  with due as (
    select n.id
    from public.notifications n
    where n.status='queued'
      and n.scheduled_for <= now()
      and (n.next_attempt_at is null or n.next_attempt_at <= now())
    order by n.scheduled_for, n.id
    for update skip locked
    limit v_limit
  )
  update public.notifications n
  set status='processing',
      attempts=n.attempts+1,
      last_attempt_at=now(),
      error=null
  from due
  where n.id=due.id;

  return query
  select
    n.id,
    n.barbershop_id,
    n.appointment_id,
    n.waitlist_entry_id,
    n.channel,
    n.template_key,
    n.recipient,
    n.payload,
    n.scheduled_for,
    n.attempts,
    coalesce(c.name,w.customer_name),
    coalesce(c.phone,w.phone),
    coalesce(c.email,w.email),
    coalesce(s_a.name,s_w.name),
    coalesce(h_a.name,h_w.name),
    coalesce(b_a.display_name,b_w_offer.display_name,b_w_pref.display_name),
    coalesce(a.starts_at,w.offer_slot_start),
    coalesce(a.ends_at,
      case
        when w.offer_slot_start is not null and s_w.duration_min is not null
        then w.offer_slot_start + make_interval(mins=>s_w.duration_min)
        else null
      end
    ),
    coalesce(s_a.price_cents,s_w.price_cents),
    coalesce(s_a.duration_min,s_w.duration_min),
    sh.name,
    sh.slug,
    sh.phone,
    sh.whatsapp,
    sh.timezone,
    a.manage_token,
    w.offer_token,
    w.offer_expires_at
  from public.notifications n
  join public.barbershops sh on sh.id=n.barbershop_id
  left join public.appointments a on a.id=n.appointment_id
  left join public.customers c on c.id=a.customer_id
  left join public.waitlist_entries w on w.id=n.waitlist_entry_id
  left join public.services s_a on s_a.id=a.service_id
  left join public.services s_w on s_w.id=w.service_id
  left join public.haircuts h_a on h_a.id=a.haircut_id
  left join public.haircuts h_w on h_w.id=w.haircut_id
  left join public.barbers b_a on b_a.id=a.barber_id
  left join public.barbers b_w_offer on b_w_offer.id=w.offer_barber_id
  left join public.barbers b_w_pref on b_w_pref.id=w.barber_id
  where n.status='processing'
    and n.last_attempt_at > now() - interval '2 minutes'
  order by n.scheduled_for, n.id;
end;
$function$;

revoke all on function public.claim_notifications(integer)
from public,anon,authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

create or replace function public.recover_stuck_notifications(
  p_after interval default interval '10 minutes'
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer;
begin
  update public.notifications
  set status='queued',
      next_attempt_at=now(),
      error=coalesce(error,'') || case when coalesce(error,'')='' then '' else ' | ' end || 'recovered_stuck_processing'
  where status='processing'
    and last_attempt_at is not null
    and last_attempt_at < now()-coalesce(p_after,interval '10 minutes')
    and attempts < 5;
  get diagnostics v_count = row_count;

  update public.notifications
  set status='failed',
      error=coalesce(error,'') || case when coalesce(error,'')='' then '' else ' | ' end || 'max_attempts_reached'
  where status='processing'
    and last_attempt_at is not null
    and last_attempt_at < now()-coalesce(p_after,interval '10 minutes')
    and attempts >= 5;

  return v_count;
end;
$function$;

revoke all on function public.recover_stuck_notifications(interval)
from public,anon,authenticated;
grant execute on function public.recover_stuck_notifications(interval) to service_role;

create or replace function public.mark_notification_sent(
  p_id uuid,
  p_provider_message_id text default null,
  p_meta jsonb default '{}'::jsonb
)
returns public.notif_status
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status public.notif_status;
begin
  update public.notifications n
  set status='sent',
      sent_at=coalesce(n.sent_at,now()),
      next_attempt_at=null,
      provider_message_id=nullif(btrim(coalesce(p_provider_message_id,'')),''),
      payload=n.payload || coalesce(p_meta,'{}'::jsonb),
      error=null
  where n.id=p_id
    and n.status='processing'
  returning n.status into v_status;

  if v_status is null then
    raise exception 'NOTIFICATION_NOT_PROCESSING';
  end if;

  return v_status;
end;
$function$;

revoke all on function public.mark_notification_sent(uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.mark_notification_sent(uuid,text,jsonb) to service_role;

create or replace function public.mark_notification_failure(
  p_id uuid,
  p_error text,
  p_retryable boolean default true,
  p_fallback_url text default null
)
returns table(
  status public.notif_status,
  retry_at timestamptz,
  attempts integer
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_attempts integer;
  v_retry_at timestamptz;
  v_status public.notif_status;
  v_error text := left(coalesce(p_error,'notification_delivery_failed'),1000);
begin
  select n.attempts
  into v_attempts
  from public.notifications n
  where n.id=p_id
    and n.status='processing'
  for update;

  if v_attempts is null then
    raise exception 'NOTIFICATION_NOT_PROCESSING';
  end if;

  if p_retryable and v_attempts < 5 then
    v_retry_at := now() + case v_attempts
      when 1 then interval '30 seconds'
      when 2 then interval '2 minutes'
      when 3 then interval '10 minutes'
      when 4 then interval '30 minutes'
      else interval '2 hours'
    end;
    update public.notifications n
    set status='queued',
        next_attempt_at=v_retry_at,
        error=v_error,
        fallback_url=coalesce(nullif(btrim(p_fallback_url),''),n.fallback_url)
    where n.id=p_id
      and n.status='processing'
    returning n.status into v_status;
  else
    update public.notifications n
    set status='failed',
        next_attempt_at=null,
        error=v_error,
        fallback_url=coalesce(nullif(btrim(p_fallback_url),''),n.fallback_url)
    where n.id=p_id
      and n.status='processing'
    returning n.status into v_status;
  end if;

  return query select v_status,v_retry_at,v_attempts;
end;
$function$;

revoke all on function public.mark_notification_failure(uuid,text,boolean,text)
from public,anon,authenticated;
grant execute on function public.mark_notification_failure(uuid,text,boolean,text) to service_role;

create or replace function public.get_notifications(
  p_shop uuid,
  p_status text default 'active',
  p_channel text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  notification_id uuid,
  channel public.notif_channel,
  template_key text,
  recipient_masked text,
  status public.notif_status,
  scheduled_for timestamptz,
  sent_at timestamptz,
  attempts integer,
  next_attempt_at timestamptz,
  last_error text,
  fallback_url text,
  total_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status,'active')));
  v_channel text := lower(btrim(coalesce(p_channel,'all')));
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer := greatest(coalesce(p_offset,0),0);
begin
  perform private.require_shop_operator(p_shop);

  if v_status not in ('active','queued','processing','sent','failed','skipped','all') then
    raise exception 'NOTIFICATION_STATUS_INVALID';
  end if;
  if v_channel not in ('all','whatsapp','email') then
    raise exception 'NOTIFICATION_CHANNEL_INVALID';
  end if;

  return query
  select
    n.id,
    n.channel,
    n.template_key,
    case
      when n.channel='email' then
        case
          when position('@' in n.recipient) > 2
          then left(n.recipient,2) || '•••' || substring(n.recipient from position('@' in n.recipient))
          else '•••'
        end
      when length(regexp_replace(n.recipient,'\\D','','g')) >= 8 then
        '••••••' || right(regexp_replace(n.recipient,'\\D','','g'),4)
      else '•••'
    end,
    n.status,
    n.scheduled_for,
    n.sent_at,
    n.attempts,
    n.next_attempt_at,
    n.error,
    n.fallback_url,
    count(*) over()::bigint
  from public.notifications n
  where n.barbershop_id=p_shop
    and (
      v_status='all'
      or (v_status='active' and n.status in ('queued','processing'))
      or v_status=n.status::text
    )
    and (v_channel='all' or v_channel=n.channel::text)
  order by
    case n.status when 'failed' then 0 when 'processing' then 1 when 'queued' then 2 else 3 end,
    n.scheduled_for desc,
    n.id desc
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.get_notifications(uuid,text,text,integer,integer)
from public,anon;
grant execute on function public.get_notifications(uuid,text,text,integer,integer)
to authenticated;

create or replace function public.get_notification_metrics(
  p_shop uuid
)
returns table(
  queued_count bigint,
  processing_count bigint,
  failed_count bigint,
  sent_today_count bigint,
  sent_7d_count bigint,
  delivery_rate_7d numeric
)
language sql
security definer
set search_path=''
as $function$
  select
    count(*) filter (where n.status='queued')::bigint,
    count(*) filter (where n.status='processing')::bigint,
    count(*) filter (where n.status='failed')::bigint,
    count(*) filter (where n.status='sent' and n.sent_at >= date_trunc('day',now()))::bigint,
    count(*) filter (where n.status='sent' and n.sent_at >= now()-interval '7 days')::bigint,
    case
      when count(*) filter (
        where n.status in ('sent','failed')
          and coalesce(n.sent_at,n.last_attempt_at) >= now()-interval '7 days'
      ) = 0 then 0::numeric
      else round(
        100.0 * count(*) filter (
          where n.status='sent'
            and n.sent_at >= now()-interval '7 days'
        ) / count(*) filter (
          where n.status in ('sent','failed')
            and coalesce(n.sent_at,n.last_attempt_at) >= now()-interval '7 days'
        ),2)
    end
  from public.notifications n
  where n.barbershop_id=p_shop
    and public.is_member(p_shop,array['owner','manager']::public.app_role[]);
$function$;

revoke all on function public.get_notification_metrics(uuid) from public,anon;
grant execute on function public.get_notification_metrics(uuid) to authenticated;

comment on column public.notifications.attempts is 'Number of provider delivery attempts, including the currently processing attempt.';
comment on column public.notifications.next_attempt_at is 'Next retry time for transient delivery failures.';
comment on column public.notifications.fallback_url is 'Pre-filled WhatsApp fallback URL for operator-assisted delivery.';
comment on function public.claim_notifications(integer) is 'Atomically claims due notification work for the server-side dispatcher.';
comment on function public.mark_notification_failure(uuid,text,boolean,text) is 'Transitions processing notifications to queued with exponential backoff or failed after five attempts.';
comment on function public.get_notifications(uuid,text,text,integer,integer) is 'Tenant-scoped operational notification delivery history.';
