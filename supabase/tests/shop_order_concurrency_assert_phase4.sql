do $phase4_concurrency_assert$
declare
  v_product uuid;
  v_variant uuid;
  v_key_a uuid;
  v_key_b uuid;
  v_orders integer;
  v_lines integer;
  v_reservations integer;
  v_stock integer;
  v_cached integer;
begin
  select product_id, variant_id, key_a, key_b
  into v_product, v_variant, v_key_a, v_key_b
  from private.phase4_concurrency_fixture where singleton;

  select count(*) into v_orders
  from public.appointment_product_orders o
  join public.appointment_product_order_items i on i.order_id = o.id and i.barbershop_id = o.barbershop_id
  where i.product_id = v_product;
  select count(*) into v_lines from public.appointment_product_order_items where product_id = v_product;
  select count(*) into v_reservations
  from public.inventory_reservations where variant_id = v_variant and status = 'reserved';
  select stock_on_hand into v_stock from public.shop_product_variants where id = v_variant;
  select count(*) into v_cached from public.booking_idempotency
  where key in (v_key_a, v_key_b) and response is not null;

  if v_orders <> 1 or v_lines <> 1 or v_reservations <> 1 or v_stock <> 1 or v_cached <> 1 then
    raise exception 'PHASE4_RACE_ASSERTION_FAILED orders=% lines=% reservations=% stock=% cached=%',
      v_orders, v_lines, v_reservations, v_stock, v_cached;
  end if;
  if (select count(*) from public.booking_idempotency where key in (v_key_a, v_key_b)) <> 1 then
    raise exception 'PHASE4_RACE_FAILED_TRANSACTION_LEFT_IDEMPOTENCY_ROW';
  end if;
  raise notice 'PASS | Phase 4 concurrency: exactly one order reserved the single unit';
end;
$phase4_concurrency_assert$;
