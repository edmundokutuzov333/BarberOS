-- Dedicated Phase 23 acceptance fixture. Executed only against the isolated
-- test database by scripts/test_database_phase23.py; never applied to production.
begin;

do $phase23_fixture$
declare
  v_user uuid := gen_random_uuid();
  v_shop uuid;
  v_slug text := 'phase23-acceptance-fixture';
  v_barber uuid;
  v_service uuid;
  v_haircut uuid;
  v_day date := (now() at time zone 'Africa/Maputo')::date + 3;
  v_slot_a timestamptz;
  v_slot_b timestamptz;
  v_appointment uuid;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user, 'authenticated', 'authenticated', 'phase23-owner@example.invalid', '',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.barbershops (
    slug, name, status, timezone, min_lead_time_min, max_advance_days, slot_interval_min
  ) values (
    v_slug, 'BarberOS Phase 23 Acceptance Fixture', 'active', 'Africa/Maputo', 30, 30, 15
  ) returning id into v_shop;

  insert into public.barbershops (
    slug, name, status, timezone, min_lead_time_min, max_advance_days, slot_interval_min
  ) values (
    'phase23-isolation-fixture', 'BarberOS Phase 23 Isolation Fixture', 'active',
    'Africa/Maputo', 30, 30, 15
  );

  insert into public.barbershop_members (barbershop_id, user_id, role)
  values (v_shop, v_user, 'owner');

  insert into public.barbers (barbershop_id, display_name, is_active)
  values (v_shop, 'Barbeiro Acceptance Fixture', true)
  returning id into v_barber;

  insert into public.services (barbershop_id, name, price_cents, duration_min, is_active, sort_order)
  values (v_shop, 'Serviço Acceptance Fixture', 12000, 30, true, 0)
  returning id into v_service;

  insert into public.barber_services (barber_id, service_id)
  values (v_barber, v_service);

  insert into public.haircuts (barbershop_id, service_id, name, description, is_active, sort_order)
  values (v_shop, v_service, 'Corte Acceptance Fixture', 'Fixture isolada para testes', true, 0)
  returning id into v_haircut;

  insert into public.working_hours (barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
  select v_shop, v_barber, day_no, time '00:00', time '23:59', false
  from generate_series(0, 6) as day_no;

  -- The public shop DTO exposes shop-level hours; barber-specific hours above
  -- remain the source used by the availability RPC.
  insert into public.working_hours (barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
  select v_shop, null, day_no, time '00:00', time '23:59', false
  from generate_series(0, 6) as day_no;

  select slot_start into v_slot_a
  from public.get_available_slots(v_slug, v_service, v_barber, v_day)
  order by slot_start
  limit 1;

  if v_slot_a is null then
    raise exception 'PHASE23_FIXTURE_NO_FIRST_SLOT';
  end if;

  select slot_start into v_slot_b
  from public.get_available_slots(v_slug, v_service, v_barber, v_day)
  where slot_start >= v_slot_a + interval '30 minutes'
  order by slot_start
  limit 1;

  if v_slot_b is null then
    raise exception 'PHASE23_FIXTURE_NO_SECOND_SLOT';
  end if;

  select appointment_id into v_appointment
  from public.book_appointment(
    v_slug, v_service, v_haircut, v_barber, v_slot_a,
    'Cliente Acceptance Completed', '84 000 0012', 'phase23-completed@example.invalid'
  );

  update public.appointments
  set status = 'completed'
  where id = v_appointment and barbershop_id = v_shop;

  select appointment_id into v_appointment
  from public.book_appointment(
    v_slug, v_service, v_haircut, v_barber, v_slot_b,
    'Cliente Acceptance Confirmed', '84 000 0011', 'phase23-confirmed@example.invalid'
  );

  if not exists (
    select 1 from public.appointments
    where barbershop_id = v_shop and status = 'confirmed'
  ) then
    raise exception 'PHASE23_FIXTURE_CONFIRMED_APPOINTMENT_MISSING';
  end if;

  if not exists (
    select 1 from public.appointments
    where barbershop_id = v_shop and status = 'completed' and completed_at is not null
  ) then
    raise exception 'PHASE23_FIXTURE_COMPLETED_APPOINTMENT_MISSING';
  end if;
end;
$phase23_fixture$;

commit;
