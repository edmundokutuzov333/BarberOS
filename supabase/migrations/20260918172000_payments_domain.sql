-- BarberOS Phase 16: payment persistence, isolation and invariants.

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  provider public.payment_provider not null,
  enabled boolean not null default false,
  account_reference text,
  public_config jsonb not null default '{}'::jsonb,
  credential_secret_id uuid,
  webhook_secret_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barbershop_id, provider),
  constraint payment_accounts_reference_len check (account_reference is null or char_length(account_reference) between 1 and 120),
  constraint payment_accounts_public_config_object check (jsonb_typeof(public_config)='object')
);

alter table public.payments
  add column if not exists provider_account_id uuid references public.payment_accounts(id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists provider_transaction_id text,
  add column if not exists failure_code text,
  add column if not exists failure_reason text,
  add column if not exists requires_refund boolean not null default false,
  add column if not exists paid_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists payments_idempotency_key_uq on public.payments(idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_provider_ref_uq on public.payments(provider,provider_ref) where provider_ref is not null;
create unique index if not exists payments_active_appointment_uq on public.payments(appointment_id) where appointment_id is not null and status='pending';
create index if not exists payments_appointment_created_idx on public.payments(appointment_id,created_at desc);
create index if not exists payments_shop_status_created_idx on public.payments(barbershop_id,status,created_at desc);
create index if not exists payments_reconcile_idx on public.payments(status,last_reconciled_at) where status='pending';
create index if not exists payments_refund_idx on public.payments(barbershop_id,created_at desc) where requires_refund=true;
create index if not exists payment_accounts_shop_idx on public.payment_accounts(barbershop_id,provider,enabled);

create or replace function private.payment_accounts_touch_updated_at()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin new.updated_at:=now(); return new; end;
$fn$;

drop trigger if exists payment_accounts_touch_updated_at on public.payment_accounts;
create trigger payment_accounts_touch_updated_at before update on public.payment_accounts for each row execute function private.payment_accounts_touch_updated_at();

create or replace function private.guard_payment_state()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if tg_op='UPDATE' then
    if old.status='pending' and new.status not in ('pending','paid','failed') then raise exception 'PAYMENT_INVALID_TRANSITION'; end if;
    if old.status='paid' and new.status not in ('paid','refunded') then raise exception 'PAYMENT_INVALID_TRANSITION'; end if;
    if old.status='failed' and new.status<>'failed' then raise exception 'PAYMENT_INVALID_TRANSITION'; end if;
    if old.status='refunded' and new.status<>'refunded' then raise exception 'PAYMENT_INVALID_TRANSITION'; end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_payment_state on public.payments;
create trigger guard_payment_state before update of status on public.payments for each row execute function private.guard_payment_state();

alter table public.payment_accounts enable row level security;
revoke all on table public.payment_accounts from anon,authenticated;
revoke all on table public.payments from anon,authenticated;
grant select on table public.payments to authenticated;

drop policy if exists payment_accounts_no_direct_access on public.payment_accounts;
create policy payment_accounts_no_direct_access on public.payment_accounts for all to anon,authenticated using(false) with check(false);

drop policy if exists payments_operator_read on public.payments;
create policy payments_operator_read on public.payments for select to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1 from public.barbershop_members m
    where m.barbershop_id=payments.barbershop_id
      and m.user_id=(select auth.uid())
      and m.role in ('owner','manager')
  )
);

comment on table public.payment_accounts is 'Per-tenant payment provider configuration. Credentials live only in Supabase Vault.';
comment on column public.payments.requires_refund is 'Successful provider payment that cannot be attached to the active appointment and requires operator reconciliation.';
