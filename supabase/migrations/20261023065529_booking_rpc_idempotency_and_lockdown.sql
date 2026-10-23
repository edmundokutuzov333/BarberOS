create table if not exists public.booking_idempotency (
  key uuid primary key,
  response jsonb,
  created_at timestamptz not null default now()
);

alter table public.booking_idempotency enable row level security;
revoke all on public.booking_idempotency from public, anon, authenticated;
grant select on public.booking_idempotency to service_role;

create or replace function public.book_appointment_idempotent(
  p_idempotency_key uuid,
  p_slug text,
  p_service_id uuid,
  p_haircut_id uuid,
  p_barber_id uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_email text
)
returns table(appointment_id uuid, manage_token uuid, deposit_cents integer, needs_payment boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cached jsonb;
  v_response jsonb;
  v_booking record;
begin
  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  insert into public.booking_idempotency(key, response)
  values (p_idempotency_key, null)
  on conflict (key) do nothing;

  if not found then
    select response into v_cached
    from public.booking_idempotency
    where key = p_idempotency_key
    for update;

    if v_cached is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;

    return query
    select
      (v_cached ->> 'appointment_id')::uuid,
      (v_cached ->> 'manage_token')::uuid,
      coalesce((v_cached ->> 'deposit_cents')::integer, 0),
      coalesce((v_cached ->> 'needs_payment')::boolean, false);
    return;
  end if;

  select * into v_booking
  from public.book_appointment(
    p_slug,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    p_start,
    p_name,
    p_phone,
    p_email
  );

  if not found or v_booking.manage_token is null then
    raise exception 'BOOKING_EMPTY_RESPONSE';
  end if;

  v_response := jsonb_build_object(
    'appointment_id', v_booking.appointment_id,
    'manage_token', v_booking.manage_token,
    'deposit_cents', coalesce(v_booking.deposit_cents, 0),
    'needs_payment', coalesce(v_booking.needs_payment, false)
  );

  update public.booking_idempotency
  set response = v_response
  where key = p_idempotency_key;

  return query
  select v_booking.appointment_id, v_booking.manage_token,
    coalesce(v_booking.deposit_cents, 0), coalesce(v_booking.needs_payment, false);
end;
$$;

revoke all on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  to service_role;

revoke all on function public.book_appointment(text, uuid, uuid, uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.book_appointment(text, uuid, uuid, uuid, timestamptz, text, text, text)
  to service_role;
