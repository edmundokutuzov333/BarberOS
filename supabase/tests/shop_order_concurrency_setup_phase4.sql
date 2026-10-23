-- CI-only fixture for a real two-session stock reservation race.
-- This runs only against the ephemeral Supabase database created by ci.yml.
begin;
create table if not exists private.phase4_concurrency_fixture (
  singleton boolean primary key default true check (singleton),
  shop_id uuid not null,
  slug text not null,
  service_id uuid not null,
  barber_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  slot_a timestamptz not null,
  slot_b timestamptz not null,
  key_a uuid not null,
  key_b uuid not null
);
truncate table private.phase4_concurrency_fixture;

do $phase4_concurrency_setup$
declare
  v_shop uuid;
  v_slug text;
  v_barber uuid;
  v_service uuid;
  v_day date;
  v_slots timestamptz[];
  v_slot_a timestamptz;
  v_slot_b timestamptz;
  v_category uuid;
  v_product uuid;
  v_variant uuid;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.barbershops(
    slug, name, status, timezone, min_lead_time_min, max_advance_days, slot_interval_min
  ) values (
    'phase4-race-' || left(replace(gen_random_uuid()::text, '-', ''), 12),
    'BarberOS Phase 4 Race QA', 'active', 'Africa/Maputo', 30, 30, 15
  ) returning id, slug into v_shop, v_slug;

  insert into public.barbers(display_name, barbershop_id, is_active)
  values ('Barbeiro Race QA', v_shop, true) returning id into v_barber;

  insert into public.services(barbershop_id, name, price_cents, duration_min, is_active)
  values (v_shop, 'Serviço Race QA', 12000, 30, true) returning id into v_service;

  insert into public.barber_services(barber_id, service_id) values (v_barber, v_service);
  insert into public.working_hours(barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
  select v_shop, v_barber, day_no, time '00:00', time '23:59', false
  from generate_series(0, 6) day_no;

  update public.barbershops set shop_enabled = true where id = v_shop;

  select d.day into v_day
  from public.get_available_days(
    v_slug, v_service, v_barber,
    (now() at time zone 'Africa/Maputo')::date + 2,
    (now() at time zone 'Africa/Maputo')::date + 10
  ) d
  where d.is_open and d.slots_count >= 2
  order by d.day limit 1;
  if v_day is null then raise exception 'PHASE4_RACE_NO_AVAILABLE_DAY'; end if;

  select q.slot_start into v_slot_a
  from public.get_available_slots(v_slug, v_service, v_barber, v_day) q
  order by q.slot_start
  limit 1;
  if v_slot_a is null then raise exception 'PHASE4_RACE_NEEDS_FIRST_SLOT'; end if;

  -- The service lasts 30 minutes while the calendar interval is 15 minutes.
  -- Select a non-overlapping second slot so the race tests stock, not scheduling.
  select q.slot_start into v_slot_b
  from public.get_available_slots(v_slug, v_service, v_barber, v_day) q
  where q.slot_start >= v_slot_a + interval '30 minutes'
  order by q.slot_start
  limit 1;
  if v_slot_b is null then raise exception 'PHASE4_RACE_NEEDS_NON_OVERLAPPING_SLOT'; end if;
  v_slots := array[v_slot_a, v_slot_b];

  insert into public.shop_products(barbershop_id, name, product_kind, track_stock, is_active)
  values (v_shop, 'Produto Race QA', 'consume_here', true, false) returning id into v_product;

  insert into public.shop_product_variants(barbershop_id, product_id, label, unit_label, price_minor, is_active)
  values (v_shop, v_product, 'Unidade', 'unidade', 1000, true) returning id into v_variant;

  update public.shop_products set is_active = true where id = v_product;
  perform public.record_shop_inventory_movement(v_shop, v_variant, 1, 'opening_balance', 'CI concurrency fixture');

  insert into private.phase4_concurrency_fixture(
    singleton, shop_id, slug, service_id, barber_id, product_id, variant_id, slot_a, slot_b, key_a, key_b
  ) values (
    true, v_shop, v_slug, v_service, v_barber, v_product, v_variant, v_slots[1], v_slots[2], gen_random_uuid(), gen_random_uuid()
  );
end;
$phase4_concurrency_setup$;
commit;
select slug, service_id, product_id, variant_id, slot_a, slot_b, key_a, key_b
from private.phase4_concurrency_fixture where singleton;
