create table if not exists public.resend_email_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  provider_message_id text not null,
  event_type text not null check (event_type in ('delivered', 'bounced', 'complained')),
  notification_id uuid references public.notifications(id) on delete set null,
  received_at timestamptz not null default now(),
  constraint resend_email_events_provider_event_id_valid
    check (length(btrim(provider_event_id)) between 1 and 255),
  constraint resend_email_events_provider_message_id_valid
    check (length(btrim(provider_message_id)) between 1 and 255)
);

create index if not exists resend_email_events_message_received_idx
  on public.resend_email_events (provider_message_id, received_at desc);

alter table public.resend_email_events enable row level security;
alter table public.resend_email_events force row level security;
revoke all on table public.resend_email_events from public, anon, authenticated;
grant all on table public.resend_email_events to service_role;

create or replace function public.record_email_event(
  p_provider_message_id text,
  p_event text,
  p_provider_event_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notification_id uuid;
begin
  if nullif(btrim(p_provider_message_id), '') is null
    or length(btrim(p_provider_message_id)) > 255
    or nullif(btrim(p_provider_event_id), '') is null
    or length(btrim(p_provider_event_id)) > 255
    or p_event not in ('delivered', 'bounced', 'complained')
  then
    raise exception 'RESEND_EMAIL_EVENT_INVALID';
  end if;

  select n.id
    into v_notification_id
  from public.notifications n
  where n.provider_message_id = btrim(p_provider_message_id)
    and n.channel = 'email'
  order by n.sent_at desc nulls last, n.id desc
  limit 1;

  insert into public.resend_email_events (
    provider_event_id,
    provider_message_id,
    event_type,
    notification_id
  )
  values (
    btrim(p_provider_event_id),
    btrim(p_provider_message_id),
    p_event,
    v_notification_id
  )
  on conflict (provider_event_id) do nothing;
end;
$function$;

revoke all on function public.record_email_event(text, text, text) from public, anon, authenticated;
grant execute on function public.record_email_event(text, text, text) to service_role;
