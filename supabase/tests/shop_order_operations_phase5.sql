-- BarberOS | Fase 5 | transições, atribuição, reservas e entregas idempotentes.
-- Fixtures isoladas em transacção: o ROLLBACK remove todos os registos de teste.
begin;
do $shop_order_operations_phase5$
declare
  v_actor uuid := gen_random_uuid();
  v_shop uuid;
  v_barber uuid;
  v_service uuid;
  v_customer uuid;
  v_category uuid;
  v_product uuid;
  v_variant uuid;
  v_appointment uuid;
  v_order uuid;
  v_item uuid;
  v_order_b uuid;
  v_item_b uuid;
  v_order_c uuid;
  v_order_d uuid;
  v_order_e uuid;
  v_slot timestamptz := now()+interval '90 days';
  v_key_full uuid := gen_random_uuid();
  v_key_partial_one uuid := gen_random_uuid();
  v_key_partial_two uuid := gen_random_uuid();
  v_result jsonb;
  v_rejected boolean;
  v_error text;
  v_stock integer;
  v_delivered integer;
  v_reserved integer;
  v_item_status text;
begin
  insert into auth.users (
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values (
    v_actor,'authenticated','authenticated',
    'phase5-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
  );

  insert into public.barbershops (
    slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min
  ) values (
    'phase5-'||left(replace(gen_random_uuid()::text,'-',''),12),
    'BarberOS Phase 5 QA','active','Africa/Maputo',30,120,15
  ) returning id into v_shop;
  insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
  insert into public.barbers(display_name,barbershop_id,is_active)
    values('Barbeiro Fase 5 QA',v_shop,true) returning id into v_barber;
  insert into public.services(barbershop_id,name,price_cents,duration_min,is_active)
    values(v_shop,'Serviço Fase 5 QA',10000,30,true) returning id into v_service;
  insert into public.customers(barbershop_id,name,phone)
    values(v_shop,'Cliente Fase 5 QA','+25884'||substr(replace(gen_random_uuid()::text,'-',''),1,7))
    returning id into v_customer;
  insert into public.shop_product_categories(barbershop_id,name,is_active)
    values(v_shop,'Categoria Fase 5 QA',true) returning id into v_category;
  insert into public.shop_products(barbershop_id,category_id,name,product_kind,track_stock,is_active)
    values(v_shop,v_category,'Produto Fase 5 QA','takeaway',true,false) returning id into v_product;
  insert into public.shop_product_variants(barbershop_id,product_id,label,unit_label,price_minor,is_active)
    values(v_shop,v_product,'Unidade QA','unidade',1000,true) returning id into v_variant;
  update public.shop_products set is_active=true where id=v_product;

  perform set_config('request.jwt.claim.role','service_role',true);
  update public.barbershops set shop_enabled=true where id=v_shop;
  perform public.record_shop_inventory_movement(v_shop,v_variant,4,'opening_balance','Fase 5 fixture');
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);

  -- Full delivery with all stock reserved: consume reservation then stock in one transaction.
  insert into public.appointments(
    barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status
  ) values(v_shop,v_barber,v_service,v_customer,v_slot,v_slot+interval '30 min',30,10000,'confirmed')
  returning id into v_appointment;
  insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
    values(v_shop,v_appointment,'received') returning id into v_order;
  insert into public.appointment_product_order_items(
    barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
    unit_price_snapshot,qty,options,line_total_snapshot,status
  ) values(v_shop,v_order,v_product,v_variant,'Produto Fase 5 QA','Unidade QA',1000,4,'{}',4000,'requested')
    returning id into v_item;
  insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
    values(v_shop,v_order,v_variant,4,'reserved',null);

  perform public.update_shop_order_operation(v_shop,v_order,'assign',null,v_actor);
  if (select assigned_to from public.appointment_product_orders where id=v_order) is distinct from v_actor then
    raise exception 'FAIL: assignment was not persisted';
  end if;
  perform public.update_shop_order_operation(v_shop,v_order,'accept',null,null);
  perform public.update_shop_order_item_operation(v_shop,v_order,v_item,'accept',null,null,null);
  perform public.update_shop_order_operation(v_shop,v_order,'prepare',null,null);
  perform public.update_shop_order_item_operation(v_shop,v_order,v_item,'prepare',null,null,null);
  perform public.update_shop_order_item_operation(v_shop,v_order,v_item,'ready',null,null,null);
  perform public.update_shop_order_operation(v_shop,v_order,'ready',null,null);

  v_result := public.update_shop_order_item_operation(v_shop,v_order,v_item,'deliver',4,null,v_key_full);
  if v_result->>'status'<>'delivered' or coalesce((v_result->>'idempotent')::boolean,true) then
    raise exception 'FAIL: first full delivery response is incorrect';
  end if;
  select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
  if v_stock<>0 then raise exception 'FAIL: full delivery did not decrement stock exactly to zero'; end if;
  if (select status from public.appointment_product_orders where id=v_order)<>'delivered' then
    raise exception 'FAIL: full delivery did not close parent order';
  end if;
  if (select status from public.inventory_reservations where order_id=v_order and variant_id=v_variant)<>'consumed' then
    raise exception 'FAIL: full delivery did not consume the reservation';
  end if;
  v_result := public.update_shop_order_item_operation(v_shop,v_order,v_item,'deliver',4,null,v_key_full);
  if coalesce((v_result->>'idempotent')::boolean,false) is not true then
    raise exception 'FAIL: duplicate delivery was not marked idempotent';
  end if;
  select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
  select count(*)::integer into v_reserved from public.inventory_movements
    where barbershop_id=v_shop and variant_id=v_variant and reason='sale';
  if v_stock<>0 or v_reserved<>1 then raise exception 'FAIL: duplicate full delivery decremented stock twice'; end if;

  -- Partial delivery: a reservation quantity is immutable, so replace the row with its remainder.
  perform public.record_shop_inventory_movement(v_shop,v_variant,6,'purchase','Fase 5 stock replenishment');
  v_slot := v_slot+interval '1 hour';
  insert into public.appointments(
    barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status
  ) values(v_shop,v_barber,v_service,v_customer,v_slot,v_slot+interval '30 min',30,10000,'confirmed')
  returning id into v_appointment;
  insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
    values(v_shop,v_appointment,'received') returning id into v_order_b;
  insert into public.appointment_product_order_items(
    barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
    unit_price_snapshot,qty,options,line_total_snapshot,status
  ) values(v_shop,v_order_b,v_product,v_variant,'Produto Fase 5 QA','Unidade QA',1000,3,'{}',3000,'requested')
    returning id into v_item_b;
  insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
    values(v_shop,v_order_b,v_variant,3,'reserved',null);

  perform public.update_shop_order_operation(v_shop,v_order_b,'accept',null,null);
  perform public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'accept',null,null,null);
  perform public.update_shop_order_operation(v_shop,v_order_b,'prepare',null,null);
  perform public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'prepare',null,null,null);
  perform public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'ready',null,null,null);
  perform public.update_shop_order_operation(v_shop,v_order_b,'ready',null,null);
  v_result := public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'deliver',1,null,v_key_partial_one);
  if v_result->>'status'<>'partially_delivered' then raise exception 'FAIL: partial delivery status is wrong'; end if;
  select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
  select coalesce(sum(qty),0)::integer into v_reserved from public.inventory_reservations
    where order_id=v_order_b and variant_id=v_variant and status='reserved';
  if v_stock<>5 or v_reserved<>2 then raise exception 'FAIL: partial delivery did not reconcile stock and reservation'; end if;

  v_result := public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'deliver',1,null,v_key_partial_one);
  select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
  select delivered_qty into v_delivered from public.appointment_product_order_items where id=v_item_b;
  if v_stock<>5 or v_delivered<>1 or coalesce((v_result->>'idempotent')::boolean,false) is not true then
    raise exception 'FAIL: replayed partial delivery duplicated stock or delivered quantity';
  end if;

  v_result := public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'deliver',2,null,v_key_partial_two);
  select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
  select status into v_item_status from public.appointment_product_order_items where id=v_item_b;
  if v_stock<>3 or v_item_status<>'delivered' or (select status from public.appointment_product_orders where id=v_order_b)<>'delivered' then
    raise exception 'FAIL: second partial delivery did not reconcile final stock and states';
  end if;

  -- Unavailability releases reservations and requires confirmation.
  v_slot := v_slot+interval '1 hour';
  insert into public.appointments(
    barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status
  ) values(v_shop,v_barber,v_service,v_customer,v_slot,v_slot+interval '30 min',30,10000,'confirmed')
  returning id into v_appointment;
  insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
    values(v_shop,v_appointment,'received') returning id into v_order_c;
  insert into public.appointment_product_order_items(
    barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
    unit_price_snapshot,qty,options,line_total_snapshot,status
  ) values(v_shop,v_order_c,v_product,v_variant,'Produto Fase 5 QA','Unidade QA',1000,1,'{}',1000,'requested')
    returning id into v_item;
  insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
    values(v_shop,v_order_c,v_variant,1,'reserved',null);
  perform public.update_shop_order_item_operation(v_shop,v_order_c,v_item,'unavailable',null,'Sem stock disponível',null);
  if (select status from public.appointment_product_orders where id=v_order_c)<>'needs_confirmation' then
    raise exception 'FAIL: unavailable item did not move order to needs_confirmation';
  end if;
  if (select status from public.inventory_reservations where order_id=v_order_c and variant_id=v_variant)<>'released' then
    raise exception 'FAIL: unavailable item did not release reservation';
  end if;
  perform public.update_shop_order_operation(v_shop,v_order_c,'accept',null,null);
  perform public.update_shop_order_operation(v_shop,v_order_c,'prepare',null,null);
  v_result := public.restore_shop_order_item_operation(v_shop,v_order_c,v_item,'Disponibilidade confirmada pela equipa');
  if v_result->>'status'<>'accepted' or (select status from public.appointment_product_order_items where id=v_item)<>'accepted' then
    raise exception 'FAIL: unavailable item could not be restored after confirmation';
  end if;
  if (select sum(qty) from public.inventory_reservations where order_id=v_order_c and variant_id=v_variant and status='reserved')<>1 then
    raise exception 'FAIL: restoring item did not recreate its stock reservation';
  end if;
  perform public.update_shop_order_operation(v_shop,v_order_c,'cancel','Cliente cancelou após confirmação',null);
  if (select status from public.inventory_reservations where order_id=v_order_c and variant_id=v_variant and status='reserved') is not null then
    raise exception 'FAIL: cancellation after item restoration did not release its reservation';
  end if;

  -- Cancelled and failed parent orders both release their reservations.
  v_slot := v_slot+interval '1 hour';
  insert into public.appointments(
    barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status
  ) values(v_shop,v_barber,v_service,v_customer,v_slot,v_slot+interval '30 min',30,10000,'confirmed')
  returning id into v_appointment;
  insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
    values(v_shop,v_appointment,'received') returning id into v_order_d;
  insert into public.appointment_product_order_items(
    barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
    unit_price_snapshot,qty,options,line_total_snapshot,status
  ) values(v_shop,v_order_d,v_product,v_variant,'Produto Fase 5 QA','Unidade QA',1000,1,'{}',1000,'requested')
    returning id into v_item;
  insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
    values(v_shop,v_order_d,v_variant,1,'reserved',null);
  perform public.update_shop_order_operation(v_shop,v_order_d,'cancel','Cliente cancelou o pedido',null);
  if (select status from public.inventory_reservations where order_id=v_order_d and variant_id=v_variant)<>'released' then
    raise exception 'FAIL: cancellation did not release reserved stock';
  end if;

  v_slot := v_slot+interval '1 hour';
  insert into public.appointments(
    barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status
  ) values(v_shop,v_barber,v_service,v_customer,v_slot,v_slot+interval '30 min',30,10000,'confirmed')
  returning id into v_appointment;
  insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
    values(v_shop,v_appointment,'received') returning id into v_order_e;
  insert into public.appointment_product_order_items(
    barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
    unit_price_snapshot,qty,options,line_total_snapshot,status
  ) values(v_shop,v_order_e,v_product,v_variant,'Produto Fase 5 QA','Unidade QA',1000,1,'{}',1000,'requested')
    returning id into v_item;
  insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
    values(v_shop,v_order_e,v_variant,1,'reserved',null);
  perform public.update_shop_order_operation(v_shop,v_order_e,'fail',null,null);
  if (select status from public.inventory_reservations where order_id=v_order_e and variant_id=v_variant)<>'released' then
    raise exception 'FAIL: failed order did not release reserved stock';
  end if;

  v_rejected := false;
  begin
    perform public.update_shop_order_item_operation(v_shop,v_order_b,v_item_b,'deliver',2,null,v_key_partial_one);
  exception when raise_exception then
    get stacked diagnostics v_error=message_text;
    if v_error='SHOP_OPERATION_KEY_REUSED' then v_rejected:=true; else raise; end if;
  end;
  if not v_rejected then raise exception 'FAIL: operation key reused with a different quantity was accepted'; end if;

  raise notice 'PASS | Phase 5: assignment, full and partial delivery, reservation reconciliation, idempotent retries, unavailability, cancellation, failure.';
end;
$shop_order_operations_phase5$;
rollback;
