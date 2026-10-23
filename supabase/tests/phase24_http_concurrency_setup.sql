-- Isolated local-only fixture for the Phase 24 HTTP booking concurrency test.
-- The local Supabase database is reset for every CI run; no staging or production data is touched.
create table if not exists private.phase24_http_concurrency_fixture (
  singleton boolean primary key default true check (singleton),
  shop_id uuid not null,
  slug text not null,
  service_id uuid not null,
  barber_id uuid not null,
  slot_start timestamptz not null
);
truncate table private.phase24_http_concurrency_fixture;

do $phase24_http_fixture$
declare
  v_shop uuid;
  v_slug text;
  v_barber uuid;
  v_service uuid;
  v_day date;
  v_slot timestamptz;
begin
  insert into public.barbershops(
    slug, name, status, timezone, min_lead_time_min, max_advance_days, slot_interval_min
  ) values (
    'phase24-http-' || left(replace(gen_random_uuid()::text, '-', ''), 12),
    'BarberOS Phase 24 HTTP QA', 'active', 'Africa/Maputo', 30, 30, 15
  ) returning id, slug into v_shop, v_slug;

  insert into public.barbers(display_name, barbershop_id, is_active)
  values ('Barbeiro HTTP QA ' || left(replace(gen_random_uuid()::text, '-', ''), 6), v_shop, true)
  returning id into v_barber;

  insert into public.services(barbershop_id, name, price_cents, duration_min, is_active)
  values (v_shop, 'Serviço HTTP QA ' || left(replace(gen_random_uuid()::text, '-', ''), 6), 12000, 30, true)
  returning id into v_service;

  insert into public.barber_services(barber_id, service_id) values (v_barber, v_service);
  insert into public.working_hours(barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
  select v_shop, v_barber, day_no, time '00:00', time '23:59', false
  from generate_series(0, 6) day_no;

  select d.day into v_day
  from public.get_available_days(
    v_slug, v_service, v_barber,
    (now() at time zone 'Africa/Maputo')::date + 2,
    (now() at time zone 'Africa/Maputo')::date + 10
  ) d
  where d.is_open and d.slots_count > 0
  order by d.day
  limit 1;
  if v_day is null then raise exception 'PHASE24_HTTP_NO_AVAILABLE_DAY'; end if;

  select s.slot_start into v_slot
  from public.get_available_slots(v_slug, v_service, v_barber, v_day) s
  where s.slot_start > now() + interval '1 hour'
  order by s.slot_start
  limit 1;
  if v_slot is null then raise exception 'PHASE24_HTTP_NO_AVAILABLE_SLOT'; end if;

  insert into private.phase24_http_concurrency_fixture(singleton, shop_id, slug, service_id, barber_id, slot_start)
  values (true, v_shop, v_slug, v_service, v_barber, v_slot);
end;
$phase24_http_fixture$;
