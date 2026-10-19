-- Close the booking idempotency contract and move token operations behind the Edge gateway.
-- Safe to apply after 20261019110000_booking_gateway_hardening.sql.

create or replace function public.book_appointment_idempotent(
  p_idempotency_key uuid,
  p_slug text,
  p_service_id uuid,
  p_haircut_id uuid,
  p_barber_id uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_email text default null
)
returns table (
  appointment_id uuid,
  manage_token uuid,
  deposit_cents integer,
  needs_payment boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_response jsonb;
  v_booking record;
  v_claimed boolean;
begin
  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  insert into public.booking_idempotency(key, response)
  values (p_idempotency_key, null)
  on conflict (key) do nothing;
  v_claimed := found;

  if not v_claimed then
    select b.response into v_response
    from public.booking_idempotency b
    where b.key = p_idempotency_key;

    if v_response is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;

    return query
      select (v_response ->> 'appointment_id')::uuid,
             (v_response ->> 'manage_token')::uuid,
             (v_response ->> 'deposit_cents')::integer,
             (v_response ->> 'needs_payment')::boolean;
    return;
  end if;

  select * into v_booking
  from public.book_appointment(
    p_slug, p_service_id, p_haircut_id, p_barber_id,
    p_start, p_name, p_phone, p_email
  );

  update public.booking_idempotency
  set response = jsonb_build_object(
    'appointment_id', v_booking.appointment_id,
    'manage_token', v_booking.manage_token,
    'deposit_cents', v_booking.deposit_cents,
    'needs_payment', v_booking.needs_payment
  )
  where key = p_idempotency_key;

  return query
    select v_booking.appointment_id, v_booking.manage_token,
           v_booking.deposit_cents, v_booking.needs_payment;
end;
$function$;

revoke all on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  to service_role;

-- Token-scoped RPCs are no longer public API endpoints. The token-gateway and
-- payment Edge Functions invoke these with service_role after validating expiry.
do $block$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like '%\_by\_token' escape '\'
        or p.proname in ('get_payment_runtime_for_token', 'init_payment_from_token')
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$block$;

comment on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  is 'Service-role-only atomic booking with idempotent response replay; must be called through booking-create.';
