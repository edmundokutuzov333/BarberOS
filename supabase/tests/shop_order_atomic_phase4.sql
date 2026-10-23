-- BarberOS | Fase 4 | marcação + pedido atómicos.
-- Usa uma barbearia/slot reais do staging, cria fixtures QA dentro da transacção e reverte tudo.
begin;
do $shop_order_atomic_phase4$
declare
  v_shop uuid;
  v_slug text;
  v_service uuid;
  v_barber uuid;
  v_category uuid;
  v_product uuid;
  v_variant uuid;
  v_appointment uuid;
  v_manage_token uuid;
  v_order uuid;
  v_start timestamptz;
  v_second_start timestamptz;
  v_day date;
  v_key uuid := gen_random_uuid();
  v_failed_key uuid := gen_random_uuid();
  v_tamper_key uuid := gen_random_uuid();
  v_hash text := repeat('a', 64);
  v_result record;
  v_retry record;
  v_rejected boolean;
  v_error text;
  v_before integer;
  v_after integer;
  v_stock integer;
  v_reserved integer;
  v_order_json jsonb;
  v_items jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.barbershops(
    slug, name, status, timezone, min_lead_time_min, max_advance_days, slot_interval_min
  ) values (
    'phase4-' || left(replace(gen_random_uuid()::text, '-', ''), 12),
    'BarberOS Phase 4 QA', 'active', 'Africa/Maputo', 30, 30, 15
  ) returning id, slug into v_shop, v_slug;

  insert into public.barbers(display_name, barbershop_id, is_active)
  values ('Barbeiro Fase 4 QA', v_shop, true)
  returning id into v_barber;

  insert into public.services(barbershop_id, name, price_cents, duration_min, is_active)
  values (v_shop, 'Serviço Fase 4 QA', 12000, 30, true)
  returning id into v_service;

  insert into public.barber_services(barber_id, service_id) values (v_barber, v_service);
  insert into public.working_hours(barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
  select v_shop, v_barber, day_no, time '00:00', time '23:59', false
  from generate_series(0, 6) day_no;

  update public.barbershops set shop_enabled = true where id = v_shop;

  select d.day into v_day
  from public.get_available_days(
    v_slug, v_service, null,
    (now() at time zone 'Africa/Maputo')::date + 2,
    (now() at time zone 'Africa/Maputo')::date + 10
  ) d
  where d.is_open and d.slots_count >= 2
  order by d.day
  limit 1;
  if v_day is null then raise exception 'NO_PHASE4_QA_AVAILABLE_DAY'; end if;

  select slot_start into v_start
  from public.get_available_slots(v_slug, v_service, null, v_day)
  order by slot_start limit 1;
  if v_start is null then raise exception 'NO_PHASE4_QA_AVAILABLE_SLOT'; end if;

  insert into public.shop_product_categories(barbershop_id, name, is_active)
  values (v_shop, 'Fase 4 QA ' || left(replace(gen_random_uuid()::text, '-', ''), 8), true)
  returning id into v_category;

  insert into public.shop_products(
    barbershop_id, category_id, name, product_kind, track_stock, is_active, order_options
  ) values (
    v_shop, v_category, 'Produto Fase 4 QA', 'consume_here', true, false, '["Sem açúcar"]'::jsonb
  ) returning id into v_product;

  insert into public.shop_product_variants(
    barbershop_id, product_id, label, unit_label, price_minor, is_active
  ) values (v_shop, v_product, 'Unidade QA', 'unidade', 1234, true)
  returning id into v_variant;

  update public.shop_products set is_active = true where id = v_product;
  perform public.record_shop_inventory_movement(v_shop, v_variant, 5, 'opening_balance', 'Fase 4 rollback fixture');

  v_items := jsonb_build_array(jsonb_build_object(
    'variant_id', v_variant,
    'qty', 2,
    'options', jsonb_build_array('Sem açúcar'),
    'fulfilment_mode', 'consume_here'
  ));

  select * into v_result
  from public.book_appointment_with_shop_order_idempotent(
    v_key, v_slug, v_service, null, null, v_start,
    'Cliente Fase 4 QA', '84 000 0064', 'phase4-atomic@example.com',
    v_items, v_hash
  );

  if v_result.appointment_id is null or v_result.manage_token is null
     or v_result.shop_order_status <> 'received'
     or v_result.shop_order_item_count <> 1
     or v_result.shop_subtotal_minor <> 2468 then
    raise exception 'FAIL: combined booking/order response contract';
  end if;
  v_appointment := v_result.appointment_id;
  v_manage_token := v_result.manage_token;

  select id into v_order from public.appointment_product_orders
  where appointment_id = v_appointment and barbershop_id = v_shop;
  if v_order is null then raise exception 'FAIL: order not created atomically'; end if;

  if not exists (
    select 1 from public.appointment_product_order_items i
    where i.order_id = v_order and i.barbershop_id = v_shop
      and i.product_id = v_product and i.variant_id = v_variant
      and i.product_name_snapshot = 'Produto Fase 4 QA'
      and i.unit_price_snapshot = 1234 and i.qty = 2
      and i.line_total_snapshot = 2468
      and i.options->'preferences' = '["Sem açúcar"]'::jsonb
      and i.options->>'fulfilment_mode' = 'consume_here'
  ) then raise exception 'FAIL: server-derived price/snapshot/options contract'; end if;

  select stock_on_hand into v_stock from public.shop_product_variants where id = v_variant;
  select coalesce(sum(qty), 0)::integer into v_reserved from public.inventory_reservations
  where order_id = v_order and variant_id = v_variant and status = 'reserved';
  if v_stock <> 5 or v_reserved <> 2 then raise exception 'FAIL: stock must be reserved, not silently consumed'; end if;

  select * into v_retry
  from public.book_appointment_with_shop_order_idempotent(
    v_key, v_slug, v_service, null, null, v_start,
    'Cliente Fase 4 QA', '84 000 0064', 'phase4-atomic@example.com',
    v_items, v_hash
  );
  if v_retry.appointment_id <> v_appointment or v_retry.manage_token <> v_manage_token
     or (select count(*) from public.appointment_product_orders where appointment_id = v_appointment) <> 1 then
    raise exception 'FAIL: idempotent replay created a duplicate order';
  end if;

  v_rejected := false;
  begin
    perform * from public.book_appointment_with_shop_order_idempotent(
      v_key, v_slug, v_service, null, null, v_start,
      'Cliente Fase 4 QA', '84 000 0064', 'phase4-atomic@example.com',
      v_items, repeat('b', 64)
    );
    raise exception 'EXPECTED_IDEMPOTENCY_KEY_REUSED';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error = 'IDEMPOTENCY_KEY_REUSED' then v_rejected := true;
    elsif v_error = 'EXPECTED_IDEMPOTENCY_KEY_REUSED' then raise;
    else raise;
    end if;
  end;
  if not v_rejected then raise exception 'FAIL: idempotency key accepted changed request'; end if;

  -- Client-supplied prices are rejected, not trusted.
  v_rejected := false;
  begin
    perform * from public.book_appointment_with_shop_order_idempotent(
      v_tamper_key, v_slug, v_service, null, null, v_start,
      'Cliente Fase 4 QA', '84 000 0064', 'phase4-atomic@example.com',
      jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant, 'qty', 1, 'options', '[]'::jsonb,
        'fulfilment_mode', 'consume_here', 'unit_price_minor', 1
      )), repeat('c', 64)
    );
    raise exception 'EXPECTED_INVALID_SHOP_ORDER_ITEMS';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error = 'INVALID_SHOP_ORDER_ITEMS' then v_rejected := true;
    elsif v_error = 'EXPECTED_INVALID_SHOP_ORDER_ITEMS' then raise;
    else raise;
    end if;
  end;
  if not v_rejected then raise exception 'FAIL: client price was not rejected'; end if;

  select slot_start into v_second_start
  from public.get_available_slots(v_slug, v_service, null, v_day)
  where slot_start <> v_start
  order by slot_start limit 1;
  if v_second_start is null then raise exception 'NO_SECOND_REAL_AVAILABLE_SLOT'; end if;
  select count(*) into v_before from public.appointments;

  v_rejected := false;
  begin
    perform * from public.book_appointment_with_shop_order_idempotent(
      v_failed_key, v_slug, v_service, null, null, v_second_start,
      'Cliente Fase 4 Stock QA', '84 000 0065', 'phase4-stock@example.com',
      jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant, 'qty', 4, 'options', '[]'::jsonb,
        'fulfilment_mode', 'consume_here'
      )), repeat('d', 64)
    );
    raise exception 'EXPECTED_SHOP_STOCK_UNAVAILABLE';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error = 'SHOP_STOCK_UNAVAILABLE' then v_rejected := true;
    elsif v_error = 'EXPECTED_SHOP_STOCK_UNAVAILABLE' then raise;
    else raise;
    end if;
  end;
  if not v_rejected then raise exception 'FAIL: over-reservation was accepted'; end if;
  select count(*) into v_after from public.appointments;
  if v_after <> v_before then raise exception 'FAIL: failed order left an appointment behind'; end if;
  if exists (select 1 from public.booking_idempotency where key = v_failed_key) then
    raise exception 'FAIL: failed transaction left an idempotency record';
  end if;

  -- Cancelling the appointment cancels the order and releases its reservation.
  update public.appointments set status = 'cancelled', cancel_reason = 'Fase 4 QA rollback'
  where id = v_appointment and barbershop_id = v_shop;
  if not exists (
    select 1 from public.appointment_product_orders
    where id = v_order and status = 'cancelled'
  ) then raise exception 'FAIL: appointment cancellation did not cancel linked order'; end if;
  if not exists (
    select 1 from public.inventory_reservations
    where order_id = v_order and variant_id = v_variant and status = 'released' and released_at is not null
  ) then raise exception 'FAIL: appointment cancellation did not release reserved stock'; end if;

  v_order_json := public.get_shop_order_by_manage_token(v_manage_token);
  if v_order_json->>'status' <> 'cancelled'
     or (v_order_json->>'subtotal_minor')::bigint <> 2468
     or jsonb_array_length(v_order_json->'items') <> 1 then
    raise exception 'FAIL: token order read model missing persisted order';
  end if;

  if has_function_privilege('anon','public.book_appointment_with_shop_order_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,text)','EXECUTE')
     or not has_function_privilege('service_role','public.book_appointment_with_shop_order_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,text)','EXECUTE')
     or has_function_privilege('anon','public.get_shop_order_by_manage_token(uuid)','EXECUTE') then
    raise exception 'FAIL: Phase 4 RPC privileges exceed contract';
  end if;

  raise notice 'PASS | Phase 4 atomic booking/order, authoritative price, idempotency, stock reservation, cancellation and token read';
end;
$shop_order_atomic_phase4$;
rollback;
