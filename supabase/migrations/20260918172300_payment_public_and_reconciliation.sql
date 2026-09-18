-- BarberOS Phase 16: public payment surfaces and service reconciliation boundaries.

create or replace function public.get_public_payment_methods(p_slug text)
returns table(payment_providers public.payment_provider[])
language sql security definer set search_path=''
as $fn$
  select coalesce(
    array_agg(a.provider order by a.provider),
    '{}'::public.payment_provider[]
  )
  from public.barbershops s
  left join public.payment_accounts a
    on a.barbershop_id=s.id
   and a.enabled=true
   and a.credential_secret_id is not null
  where s.slug=p_slug
    and s.status in ('active','trial');
$fn$;
revoke all on function public.get_public_payment_methods(text) from public,authenticated;
grant execute on function public.get_public_payment_methods(text) to anon;

drop function if exists public.get_appointment_by_token(uuid);
create function public.get_appointment_by_token(p_token uuid)
returns table(
  shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, shop_address text,
  shop_maps_url text, timezone text, cancellation_rule public.cancellation_rule,
  customer_name text, appointment_starts_at timestamptz, appointment_ends_at timestamptz,
  appointment_status public.appointment_status, deposit_status public.deposit_state, deposit_cents int,
  service_name text, service_price_cents int, service_duration_min int, haircut_name text,
  barber_name text, barber_photo_url text, can_cancel boolean, can_reschedule boolean,
  action_deadline timestamptz, hold_expires_at timestamptz,
  payment_methods public.payment_provider[], latest_payment_status public.payment_state,
  latest_payment_failure_code text, latest_payment_failure_reason text,
  latest_payment_requires_refund boolean
)
language sql security definer set search_path=''
as $fn$
  select
    sh.name,sh.slug,sh.phone,sh.whatsapp,sh.address,sh.maps_url,sh.timezone,sh.cancellation_rule,
    c.name,a.starts_at,a.ends_at,a.status,a.deposit_status,a.deposit_cents,
    s.name,s.price_cents,s.duration_min,h.name,b.display_name,b.photo_url,
    (
      a.status in ('pending','confirmed') and a.starts_at>now() and sh.cancellation_rule<>'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now()<=a.starts_at-interval '2 hours'
        when 'moderate_6h' then now()<=a.starts_at-interval '6 hours'
        when 'strict_24h' then now()<=a.starts_at-interval '24 hours'
        else false
      end
    ),
    (
      a.status in ('pending','confirmed') and a.starts_at>now()
      and (a.deposit_status<>'awaiting' or a.hold_expires_at is null or a.hold_expires_at>now())
      and sh.cancellation_rule<>'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now()<=a.starts_at-interval '2 hours'
        when 'moderate_6h' then now()<=a.starts_at-interval '6 hours'
        when 'strict_24h' then now()<=a.starts_at-interval '24 hours'
        else false
      end
    ),
    case sh.cancellation_rule
      when 'flex_2h' then a.starts_at-interval '2 hours'
      when 'moderate_6h' then a.starts_at-interval '6 hours'
      when 'strict_24h' then a.starts_at-interval '24 hours'
      else null end,
    a.hold_expires_at,
    coalesce((
      select array_agg(pa.provider order by pa.provider)
      from public.payment_accounts pa
      where pa.barbershop_id=sh.id and pa.enabled=true and pa.credential_secret_id is not null
    ),'{}'::public.payment_provider[]),
    lp.status,lp.failure_code,lp.failure_reason,lp.requires_refund
  from public.appointments a
  join public.barbershops sh on sh.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services s on s.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  left join lateral (
    select p.* from public.payments p where p.appointment_id=a.id order by p.created_at desc limit 1
  ) lp on true
  where a.manage_token=p_token;
$fn$;
revoke all on function public.get_appointment_by_token(uuid) from public,anon,authenticated;
grant execute on function public.get_appointment_by_token(uuid) to anon,authenticated;

create or replace function public.find_payment_by_provider_ref(
  p_provider public.payment_provider,
  p_provider_ref text,
  p_account uuid
)
returns table(payment_id uuid,appointment_id uuid,barbershop_id uuid,amount_cents integer,status public.payment_state,provider_ref text,msisdn text)
language sql security definer set search_path=''
as $fn$
  select p.id,p.appointment_id,p.barbershop_id,p.amount_cents,p.status,p.provider_ref,p.msisdn
  from public.payments p
  where p.provider=p_provider
    and p.provider_ref=p_provider_ref
    and p.provider_account_id=p_account
  limit 1;
$fn$;
revoke all on function public.find_payment_by_provider_ref(public.payment_provider,text,uuid) from public,anon,authenticated;
grant execute on function public.find_payment_by_provider_ref(public.payment_provider,text,uuid) to service_role;

create or replace function public.list_payment_reconciliation_batch(p_limit integer default 25)
returns table(payment_id uuid,provider public.payment_provider,provider_ref text,provider_account_id uuid,barbershop_id uuid)
language sql security definer set search_path=''
as $fn$
  select p.id,p.provider,p.provider_ref,p.provider_account_id,p.barbershop_id
  from public.payments p
  where p.status='pending'
    and p.provider_ref is not null
    and (p.last_reconciled_at is null or p.last_reconciled_at<=now()-interval '10 seconds')
  order by coalesce(p.last_reconciled_at,p.created_at),p.id
  limit greatest(1,least(coalesce(p_limit,25),100));
$fn$;
revoke all on function public.list_payment_reconciliation_batch(integer) from public,anon,authenticated;
grant execute on function public.list_payment_reconciliation_batch(integer) to service_role;

comment on function public.find_payment_by_provider_ref(public.payment_provider,text,uuid)
is 'Service-only lookup bound to provider account, preventing webhook cross-tenant/cross-account payment matches.';
comment on function public.list_payment_reconciliation_batch(integer)
is 'Service-only bounded queue of pending provider transactions due for reconciliation.';
