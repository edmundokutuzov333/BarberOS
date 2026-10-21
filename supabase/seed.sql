-- Local-only deterministic fixture for resettable acceptance tests.
-- This file is applied by `supabase db reset`; it is not a production data migration.
do $seed$
declare
  v_shop uuid;
  v_service uuid;
  v_barber uuid;
begin
  insert into public.barbershops (slug, name, status, timezone, slot_interval_min, min_lead_time_min, max_advance_days, onboarding_step)
  values ('barberos-ci-fixture', 'BarberOS CI Fixture', 'trial', 'Africa/Maputo', 15, 0, 30, 5)
  on conflict (slug) do update set
    name = excluded.name,
    status = excluded.status,
    timezone = excluded.timezone,
    slot_interval_min = excluded.slot_interval_min,
    min_lead_time_min = excluded.min_lead_time_min,
    max_advance_days = excluded.max_advance_days,
    onboarding_step = excluded.onboarding_step
  returning id into v_shop;

  insert into public.services (barbershop_id, name, price_cents, duration_min, is_active, sort_order)
  values (v_shop, 'Corte QA', 50000, 30, true, 0)
  returning id into v_service;

  insert into public.barbers (barbershop_id, display_name, years_experience, is_active, sort_order)
  values (v_shop, 'Barbeiro QA', 5, true, 0)
  returning id into v_barber;

  insert into public.barber_services (barber_id, service_id)
  values (v_barber, v_service);

  insert into public.working_hours (barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
  select v_shop, target.barber_id, day.weekday, time '08:00', time '17:00', false
  from (values (null::uuid), (v_barber)) as target(barber_id)
  cross join generate_series(0, 6) as day(weekday);
end
$seed$;
