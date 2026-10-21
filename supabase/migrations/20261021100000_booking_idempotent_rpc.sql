-- Complete the service-role-only idempotent boundary used by booking-create.
-- Every retry with the same key and payload returns the original capability token;
-- reuse of that key with a different payload is rejected.

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
  manage_token uuid,
  deposit_cents integer,
  needs_payment boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request_fingerprint text;
  v_cached jsonb;
  v_inserted integer;
  v_booking record;
begin
  if p_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  v_request_fingerprint := md5(jsonb_build_object(
    'slug', lower(btrim(coalesce(p_slug, ''))),
    'service_id', p_service_id,
    'haircut_id', p_haircut_id,
    'barber_id', p_barber_id,
    'start', p_start,
    'name', btrim(coalesce(p_name, '')),
    'phone', btrim(coalesce(p_phone, '')),
    'email', nullif(btrim(coalesce(p_email, '')), '')
  )::text);

  insert into public.booking_idempotency (key, response)
  values (p_idempotency_key, null)
  on conflict (key) do nothing;
  get diagnostics v_inserted = row_count;

  select bi.response
    into v_cached
    from public.booking_idempotency bi
   where bi.key = p_idempotency_key
   for update;

  if not found then
    raise exception 'IDEMPOTENCY_STORE_UNAVAILABLE';
  end if;

  if v_inserted = 0 then
    if v_cached is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;

    if coalesce(v_cached ->> 'request_fingerprint', '') <> v_request_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;

    return query
      select (v_cached ->> 'manage_token')::uuid,
             coalesce((v_cached ->> 'deposit_cents')::integer, 0),
             coalesce((v_cached ->> 'needs_payment')::boolean, false);
    return;
  end if;

  select b.*
    into v_booking
    from public.book_appointment(
      lower(btrim(p_slug)),
      p_service_id,
      p_haircut_id,
      p_barber_id,
      p_start,
      btrim(p_name),
      btrim(p_phone),
      nullif(btrim(coalesce(p_email, '')), '')
    ) b;

  if v_booking.manage_token is null then
    raise exception 'BOOKING_CREATE_FAILED';
  end if;

  v_cached := jsonb_build_object(
    'manage_token', v_booking.manage_token,
    'deposit_cents', coalesce(v_booking.deposit_cents, 0),
    'needs_payment', coalesce(v_booking.needs_payment, false),
    'request_fingerprint', v_request_fingerprint
  );

  update public.booking_idempotency
     set response = v_cached
   where key = p_idempotency_key;

  return query
    select v_booking.manage_token,
           coalesce(v_booking.deposit_cents, 0),
           coalesce(v_booking.needs_payment, false);
end
$function$;

revoke all on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.book_appointment_idempotent(uuid, text, uuid, uuid, uuid, timestamptz, text, text, text)
  to service_role;
