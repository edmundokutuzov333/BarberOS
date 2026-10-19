-- BarberOS — foundations for phases 5, 9 and 10.
-- All operational writes remain behind SECURITY DEFINER functions/service role.

alter table public.barbershops add column if not exists deleted_at timestamptz;
alter table public.barbers add column if not exists deleted_at timestamptz;
alter table public.services add column if not exists deleted_at timestamptz;
alter table public.haircuts add column if not exists deleted_at timestamptz;
alter table public.customers add column if not exists deleted_at timestamptz;
alter table public.customers add column if not exists marketing_consent_at timestamptz;
alter table public.customers add column if not exists marketing_consent_source text;

create index if not exists barbershops_active_idx on public.barbershops(id) where deleted_at is null;
create index if not exists barbers_active_idx on public.barbers(barbershop_id, sort_order) where deleted_at is null;
create index if not exists services_active_idx on public.services(barbershop_id, sort_order) where deleted_at is null;
create index if not exists haircuts_active_idx on public.haircuts(barbershop_id, sort_order) where deleted_at is null;
create index if not exists customers_active_idx on public.customers(barbershop_id, created_at desc) where deleted_at is null;

create table if not exists public.member_invites(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops on delete cascade,
  email text not null,
  role public.app_role not null default 'barber',
  token_hash text not null unique,
  invited_by uuid not null references auth.users on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(barbershop_id, email)
);

create table if not exists public.portfolio_items(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops on delete cascade,
  barber_id uuid references public.barbers on delete set null,
  image_url text not null,
  caption text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops on delete cascade,
  sku text,
  name text not null,
  description text,
  price_cents integer not null default 0 check(price_cents >= 0),
  stock_on_hand integer not null default 0 check(stock_on_hand >= 0),
  reorder_level integer not null default 0 check(reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(barbershop_id, sku)
);

create table if not exists public.stock_movements(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  quantity integer not null check(quantity <> 0),
  reason text not null check(reason in ('purchase','sale','adjustment','waste','return')),
  actor_id uuid references auth.users on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhooks(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops on delete cascade,
  url text not null check(url ~ '^https://'),
  secret_hash text not null,
  events text[] not null default array['appointment.created']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries(
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.webhooks on delete cascade,
  event_id uuid not null,
  status_code integer,
  attempts integer not null default 0,
  response_body text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(webhook_id, event_id)
);

create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  barbershop_id uuid references public.barbershops on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.member_invites enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.api_keys enable row level security;
alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.member_invites, public.portfolio_items, public.products,
  public.stock_movements, public.api_keys, public.webhooks,
  public.webhook_deliveries, public.push_subscriptions from anon, authenticated;
grant select on public.portfolio_items to anon, authenticated;

create policy portfolio_public_read on public.portfolio_items for select
  using (is_published and shop_is_public(barbershop_id));
create policy portfolio_member_read on public.portfolio_items for select
  using (is_member(barbershop_id) or is_platform_admin());

create or replace function public.anonymize_customer(p_customer uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare v_customer public.customers%rowtype;
begin
  select * into v_customer from public.customers where id=p_customer for update;
  if not found then return false; end if;
  perform private.require_agenda_access(v_customer.barbershop_id);
  update public.customers set
    name='Cliente anonimizado', phone='anon-' || left(id::text, 12), email=null,
    notes=null, preferences='{}'::jsonb, marketing_consent_at=null,
    marketing_consent_source=null, deleted_at=coalesce(deleted_at, now())
  where id=p_customer;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(v_customer.barbershop_id, auth.uid(), 'customer.anonymized', 'customers', p_customer,
    jsonb_build_object('reason','privacy_request'));
  return true;
end;
$function$;
grant execute on function public.anonymize_customer(uuid) to authenticated;

create or replace function public.export_customer_data(p_customer uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_customer public.customers%rowtype; v_result jsonb;
begin
  select * into v_customer from public.customers where id=p_customer;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  perform private.require_agenda_access(v_customer.barbershop_id);
  select jsonb_build_object(
    'customer', to_jsonb(v_customer),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at desc)
      from public.appointments a where a.customer_id=p_customer), '[]'::jsonb),
    'exported_at', now()
  ) into v_result;
  return v_result;
end;
$function$;
grant execute on function public.export_customer_data(uuid) to authenticated;

comment on table public.api_keys is 'Only hashed keys are stored; raw key is returned once by the management function.';
comment on table public.webhooks is 'Outbound integration foundation; delivery workers must use service role and signed payloads.';
