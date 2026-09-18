-- BarberOS by Oryon — Fase 1: esquema completo
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type app_role           as enum ('owner','manager','barber');
  create type shop_status        as enum ('trial','active','suspended','cancelled');
  create type appointment_status as enum ('pending','confirmed','in_progress','completed','cancelled','no_show');
  create type deposit_state      as enum ('not_required','awaiting','paid','failed','refunded');
  create type booking_source     as enum ('online','manual','waitlist');
  create type block_reason       as enum ('lunch','day_off','holiday','meeting','maintenance','absence','other');
  create type waitlist_status    as enum ('waiting','offered','converted','expired','cancelled');
  create type notif_channel      as enum ('whatsapp','email');
  create type notif_status       as enum ('queued','sent','failed','skipped');
  create type payment_provider   as enum ('mpesa','emola');
  create type payment_state      as enum ('pending','paid','failed','refunded');
  create type cancellation_rule  as enum ('flex_2h','moderate_6h','strict_24h','contact_only');
  create type deposit_mode       as enum ('percent','fixed');
exception when duplicate_object then null; end $$;

create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text, avatar_url text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now());

create table if not exists plans(
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null,
  price_cents int not null default 0, max_barbers int not null default 3,
  features jsonb not null default '{}'::jsonb, is_active boolean not null default true);

create table if not exists barbershops(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null, description text,
  logo_url text, cover_url text, theme_key text not null default 'violet-noir',
  phone text, whatsapp text, instagram text,
  address text, maps_url text, lat numeric, lng numeric,
  timezone text not null default 'Africa/Maputo',
  slot_interval_min int not null default 15,
  min_lead_time_min int not null default 30,
  max_advance_days int not null default 30,
  cancellation_rule cancellation_rule not null default 'flex_2h',
  deposit_enabled boolean not null default false,
  deposit_mode deposit_mode not null default 'percent',
  deposit_value int not null default 20,
  deposit_hold_min int not null default 10,
  status shop_status not null default 'trial',
  plan_id uuid references plans,
  onboarding_step int not null default 0,
  created_at timestamptz not null default now());

create table if not exists barbershop_members(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(barbershop_id,user_id));

create table if not exists barbers(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  user_id uuid references auth.users on delete set null,
  display_name text not null, photo_url text, bio text,
  years_experience int not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  is_active boolean not null default true, sort_order int not null default 0);

create table if not exists services(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  name text not null, price_cents int not null check(price_cents>=0),
  duration_min int not null check(duration_min between 5 and 480),
  requires_deposit boolean not null default false,
  is_active boolean not null default true, sort_order int not null default 0);

create table if not exists barber_services(
  barber_id uuid not null references barbers on delete cascade,
  service_id uuid not null references services on delete cascade,
  primary key(barber_id,service_id));

create table if not exists haircuts(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  service_id uuid references services on delete set null,
  name text not null, description text, photo_url text,
  price_cents int, duration_min int,
  is_active boolean not null default true, sort_order int not null default 0);

create table if not exists working_hours(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  barber_id uuid references barbers on delete cascade,
  weekday int not null check(weekday between 0 and 6),
  opens_at time not null, closes_at time not null,
  is_closed boolean not null default false,
  check (is_closed or closes_at > opens_at));

create table if not exists time_blocks(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  barber_id uuid references barbers on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason block_reason not null default 'other', note text,
  check(ends_at>starts_at));

create table if not exists customers(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  name text not null, phone text not null, email text,
  notes text, preferences jsonb not null default '{}'::jsonb,
  visits_count int not null default 0,
  no_show_count int not null default 0,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  unique(barbershop_id,phone));

create table if not exists appointments(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  barber_id uuid not null references barbers on delete restrict,
  service_id uuid not null references services on delete restrict,
  haircut_id uuid references haircuts on delete set null,
  customer_id uuid not null references customers on delete restrict,
  starts_at timestamptz not null, ends_at timestamptz not null,
  duration_min int not null, price_cents int not null,
  status appointment_status not null default 'pending',
  deposit_status deposit_state not null default 'not_required',
  deposit_cents int not null default 0,
  hold_expires_at timestamptz,
  manage_token uuid not null unique default gen_random_uuid(),
  source booking_source not null default 'online',
  internal_note text, created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz, started_at timestamptz, completed_at timestamptz,
  cancelled_at timestamptz, cancel_reason text, no_show_at timestamptz,
  check(ends_at>starts_at));

do $$ begin
  alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at,ends_at,'[)') with &&
  ) where (status in ('pending','confirmed','in_progress'));
exception when duplicate_object or duplicate_table then null; end $$;

create index if not exists appointments_shop_start_idx on appointments(barbershop_id,starts_at);
create index if not exists appointments_barber_start_idx on appointments(barber_id,starts_at);
create index if not exists time_blocks_shop_start_idx on time_blocks(barbershop_id,starts_at);

create table if not exists waitlist_entries(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  service_id uuid not null references services on delete cascade,
  haircut_id uuid references haircuts on delete set null,
  barber_id uuid references barbers on delete set null,
  customer_name text not null, phone text not null, email text,
  date_from date, date_to date,
  period text not null default 'any' check(period in ('morning','afternoon','evening','any')),
  status waitlist_status not null default 'waiting',
  offer_token uuid, offer_slot_start timestamptz, offer_barber_id uuid,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now());

create table if not exists reviews(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  barber_id uuid references barbers on delete set null,
  appointment_id uuid not null unique references appointments on delete cascade,
  rating int not null check(rating between 1 and 5),
  comment text, is_published boolean not null default true,
  created_at timestamptz not null default now());

create table if not exists payments(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  appointment_id uuid references appointments on delete set null,
  provider payment_provider not null, amount_cents int not null,
  msisdn text, status payment_state not null default 'pending',
  provider_ref text, raw jsonb, created_at timestamptz not null default now());

create table if not exists notifications(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references barbershops on delete cascade,
  appointment_id uuid references appointments on delete cascade,
  waitlist_entry_id uuid references waitlist_entries on delete cascade,
  channel notif_channel not null, template_key text not null,
  recipient text not null, payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  status notif_status not null default 'queued',
  sent_at timestamptz, error text);
create index if not exists notifications_status_sched_idx on notifications(status,scheduled_for);

create table if not exists audit_logs(
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid references barbershops on delete cascade,
  actor_id uuid references auth.users, action text not null,
  entity text, entity_id uuid, diff jsonb,
  created_at timestamptz not null default now());

-- planos base
insert into plans(code,name,price_cents,max_barbers,features) values
  ('starter','Starter',0,2,'{"whatsapp":false,"deposits":false}'),
  ('pro','Pro',150000,6,'{"whatsapp":true,"deposits":true}'),
  ('studio','Studio',350000,20,'{"whatsapp":true,"deposits":true,"multi_location":true}')
on conflict (code) do nothing;

-- perfil criado automaticamente ao registar
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id,full_name,phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
