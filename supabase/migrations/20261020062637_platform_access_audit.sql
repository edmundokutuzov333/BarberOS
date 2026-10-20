-- Audit administrative access changes without ever storing credentials.
create table if not exists public.platform_access_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text not null,
  target_user_id uuid not null,
  target_email text not null,
  action text not null check (action in ('password_reset')),
  shop_slugs text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table public.platform_access_events enable row level security;
revoke all on public.platform_access_events from public, anon, authenticated;
grant all on public.platform_access_events to service_role;

comment on table public.platform_access_events is
  'Auditable history of sensitive platform access actions. Passwords, reset tokens and secrets must never be stored in this table.';
comment on column public.platform_access_events.target_email is
  'Email snapshot at the time of the action. No password or authentication secret is stored.';
