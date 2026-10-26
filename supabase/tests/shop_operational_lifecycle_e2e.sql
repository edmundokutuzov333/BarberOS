-- BarberOS | E2E operacional integrado | pedido, entrega parcial, stock e pagamentos.
-- Fixtures isoladas, sem providers reais, com ROLLBACK obrigatório. Não é prova de piloto humano.
begin;
do $shop_operational_lifecycle_e2e$
declare
 v_actor uuid:=gen_random_uuid(); v_shop uuid; v_barber uuid; v_service uuid; v_customer uuid;
 v_category uuid; v_product uuid; v_variant uuid; v_appointment uuid; v_order uuid; v_item uuid;
 v_delivery_key uuid:=gen_random_uuid(); v_payment_key_one uuid:=gen_random_uuid(); v_payment_key_two uuid:=gen_random_uuid();
 v_result jsonb; v_payment_result jsonb; v_report jsonb; v_queue jsonb;
 v_stock integer; v_sale_movements integer; v_consumed integer; v_reserved integer; v_delivered integer;
 v_inbox integer; v_unread integer; v_alert uuid; v_rejected boolean; v_payment_count integer;
 v_from date := (now() at time zone 'Africa/Maputo')::date;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_actor,'authenticated','authenticated','shop-lifecycle-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
 values('shop-lifecycle-'||left(replace(gen_random_uuid()::text,'-',''),12),'BarberOS Operational Lifecycle QA','active','Africa/Maputo',30,120,15)
 returning id into v_shop;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
 insert into public.barbers(display_name,barbershop_id,is_active) values('Barbeiro QA Lifecycle',v_shop,true) returning id into v_barber;
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active)
 values(v_shop,'Corte QA Lifecycle',10000,30,true) returning id into v_service;
 insert into public.customers(barbershop_id,name,phone)
 values(v_shop,'Cliente QA Lifecycle','+25884'||substr(replace(gen_random_uuid()::text,'-',''),1,7)) returning id into v_customer;
 insert into public.shop_product_categories(barbershop_id,name,is_active)
 values(v_shop,'Categoria QA Lifecycle',true) returning id into v_category;
 insert into public.shop_products(barbershop_id,category_id,brand,name,description,product_kind,track_stock,is_active)
 values(v_shop,v_category,'QA only','Fixture QA Produto Lifecycle','Produto fictício de teste; não usar como catálogo comercial.','takeaway',true,false)
 returning id into v_product;
 insert into public.shop_product_variants(barbershop_id,product_id,sku,label,unit_label,price_minor,is_active)
 values(v_shop,v_product,'LIFECYCLE-QA-001','Unidade Lifecycle QA','unidade',1000,true) returning id into v_variant;
 perform set_config('request.jwt.claim.role','service_role',true);
 update public.barbershops set shop_enabled=true where id=v_shop;
 perform public.record_shop_inventory_movement(v_shop,v_variant,4,'opening_balance','Fixture QA piloto; transacção revertida.');
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 update public.shop_products set image_url='https://example.invalid/phase7-pilot-qa.jpg',
   image_alt='Imagem fictícia de teste isolado',image_source_url='https://example.invalid/phase7-pilot-source',
   image_source_note='Fixture automatizada QA; sem alegação de activo comercial real.'
 where id=v_product and barbershop_id=v_shop;
 perform public.verify_shop_catalog_product(v_shop,v_product,'Fixture de QA: preço, variante e saldo verificados apenas para ensaio automatizado; não é um produto real.');
 update public.shop_products set is_active=true where id=v_product and barbershop_id=v_shop;
 if not exists(select 1 from public.shop_products where id=v_product and is_active and catalog_verified_at is not null) then
   raise exception 'FAIL: fixture product did not pass catalog approval';
 end if;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
 values(v_shop,v_barber,v_service,v_customer,now()+interval '90 days',now()+interval '90 days 30 minutes',30,10000,'confirmed')
 returning id into v_appointment;
 insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
 values(v_shop,v_appointment,'received') returning id into v_order;
 insert into public.appointment_product_order_items(
  barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
  unit_price_snapshot,qty,options,line_total_snapshot,status
 ) values(v_shop,v_order,v_product,v_variant,'Fixture QA Produto Lifecycle','Unidade Lifecycle QA',1000,4,'{}'::jsonb,4000,'requested')
 returning id into v_item;
 insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
 values(v_shop,v_order,v_variant,4,'reserved',null);
 perform public.update_shop_order_operation(v_shop,v_order,'assign',null,v_actor);
 perform public.update_shop_order_operation(v_shop,v_order,'accept',null,null);
 perform public.update_shop_order_item_operation(v_shop,v_order,v_item,'accept',null,null,null);
 perform public.update_shop_order_operation(v_shop,v_order,'prepare',null,null);
 perform public.update_shop_order_item_operation(v_shop,v_order,v_item,'prepare',null,null,null);
 perform public.update_shop_order_item_operation(v_shop,v_order,v_item,'ready',null,null,null);
 perform public.update_shop_order_operation(v_shop,v_order,'ready',null,null);
 v_result:=public.update_shop_order_item_operation(v_shop,v_order,v_item,'deliver',3,null,v_delivery_key);
 if v_result->>'status'<>'partially_delivered' or coalesce((v_result->>'idempotent')::boolean,true) then
   raise exception 'FAIL: expected first partial delivery, got %',v_result;
 end if;
 v_result:=public.update_shop_order_item_operation(v_shop,v_order,v_item,'deliver',3,null,v_delivery_key);
 if coalesce((v_result->>'idempotent')::boolean,false) is not true then
   raise exception 'FAIL: partial delivery replay not idempotent: %',v_result;
 end if;
 select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
 select count(*) into v_sale_movements from public.inventory_movements
   where barbershop_id=v_shop and variant_id=v_variant and reason='sale';
 select count(*) into v_consumed from public.inventory_reservations
   where barbershop_id=v_shop and order_id=v_order and status='consumed';
 select coalesce(sum(qty),0)::integer into v_reserved from public.inventory_reservations
   where barbershop_id=v_shop and order_id=v_order and status='reserved';
 select coalesce(sum(delivered_qty),0)::integer into v_delivered from public.appointment_product_order_items
   where barbershop_id=v_shop and order_id=v_order;
 if v_stock<>1 or v_sale_movements<>1 or v_consumed<>0 or v_reserved<>1 or v_delivered<>3 then
   raise exception 'FAIL: partial stock reconciliation mismatch stock %, sale movements %, consumed %, reserved %, delivered %',
     v_stock,v_sale_movements,v_consumed,v_reserved,v_delivered;
 end if;
 if (select status::text from public.appointment_product_orders where id=v_order)<>'partially_delivered' then
   raise exception 'FAIL: order state does not reflect partial delivery';
 end if;
 if (select delivered_at from public.appointment_product_orders where id=v_order) is not null then
   raise exception 'FAIL: partial delivery incorrectly set delivered_at';
 end if;

 -- Pay only what was actually delivered: 3 units x 1000 = 3000 minor currency units.
 v_payment_result:=public.record_shop_order_payment(v_shop,v_order,1500,'cash','REC-LIFECYCLE-001',
   'Numerário de teste contado e confirmado para o ensaio integrado.',v_payment_key_one);
 if (v_payment_result->>'balance_minor')::bigint<>1500
   or coalesce((v_payment_result->>'idempotent')::boolean,true) then
   raise exception 'FAIL: first partial payment did not leave the expected balance: %',v_payment_result;
 end if;
 v_payment_result:=public.record_shop_order_payment(v_shop,v_order,1500,'cash','REC-LIFECYCLE-001',
   'Numerário de teste contado e confirmado para o ensaio integrado.',v_payment_key_one);
 if coalesce((v_payment_result->>'idempotent')::boolean,false) is not true then
   raise exception 'FAIL: payment replay is not idempotent';
 end if;

 v_rejected:=false;
 begin
   perform public.record_shop_order_payment(v_shop,v_order,1400,'cash','REC-LIFECYCLE-001',
     'Numerário de teste contado e confirmado para o ensaio integrado.',v_payment_key_one);
 exception when raise_exception then
   if position('SHOP_PAYMENT_IDEMPOTENCY_CONFLICT' in sqlerrm)>0 then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: payment idempotency-key conflict was accepted'; end if;

 v_rejected:=false;
 begin
   perform public.record_shop_order_payment(v_shop,v_order,1600,'cash','REC-LIFECYCLE-OVER',
     'Tentativa de sobrepagamento no ensaio integrado.',gen_random_uuid());
 exception when raise_exception then
   if position('SHOP_PAYMENT_EXCEEDS_BALANCE' in sqlerrm)>0 then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: overpayment was accepted'; end if;

 v_rejected:=false;
 begin
   perform public.record_shop_order_payment(v_shop,v_order,1500,'mpesa',null,
     'Tentativa sem referência no ensaio integrado.',v_payment_key_two);
 exception when raise_exception then
   if position('SHOP_PAYMENT_REFERENCE_REQUIRED' in sqlerrm)>0 then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: provider payment without reference was accepted'; end if;

 v_payment_result:=public.record_shop_order_payment(v_shop,v_order,1500,'mpesa','MPESA-LIFECYCLE-QA-002',
   'Referência de pagamento fictícia usada apenas no ensaio isolado.',v_payment_key_two);
 if (v_payment_result->>'balance_minor')::bigint<>0 then
   raise exception 'FAIL: completed partial-delivery settlement has a non-zero balance: %',v_payment_result;
 end if;
 select count(*) into v_payment_count from public.shop_order_payments
   where barbershop_id=v_shop and order_id=v_order;
 if v_payment_count<>2 then raise exception 'FAIL: expected exactly two persisted-in-transaction payments, got %',v_payment_count; end if;
 if has_table_privilege('authenticated','public.shop_order_payments','INSERT')
   or has_table_privilege('authenticated','public.shop_order_payments','UPDATE')
   or has_table_privilege('authenticated','public.shop_order_payments','DELETE') then
   raise exception 'FAIL: authenticated role can write directly to payment ledger';
 end if;

 v_queue:=public.get_shop_order_payment_queue(v_shop);
 if jsonb_array_length(v_queue)<>1
   or v_queue->0->>'id'<>v_order::text
   or (v_queue->0->>'due_minor')::bigint<>3000
   or (v_queue->0->>'paid_minor')::bigint<>3000
   or (v_queue->0->>'balance_minor')::bigint<>0
   or v_queue->0->>'status'<>'partially_delivered' then
   raise exception 'FAIL: payment queue does not reconcile partial delivery and payments: %',v_queue;
 end if;
 select count(*) into v_inbox from public.get_shop_notification_inbox(v_shop,100);
 if v_inbox<4 then raise exception 'FAIL: expected received/accepted/ready/delivered alerts, got %',v_inbox; end if;
 select id into v_alert from public.shop_notification_events
 where barbershop_id=v_shop and order_id=v_order order by occurred_at limit 1;
 if not public.mark_shop_notification_read(v_shop,v_alert) then raise exception 'FAIL: alert read RPC failed'; end if;
 select count(*) into v_unread from public.shop_notification_events
 where barbershop_id=v_shop and order_id=v_order and read_at is null;
 v_report:=public.get_shop_phase6_report(v_shop,v_from,v_from);
 if (v_report->>'orders_received')::int<>1 or (v_report->>'orders_accepted')::int<>1
   or (v_report->>'orders_ready')::int<>1 or (v_report->>'orders_delivered')::int<>0
   or (v_report->>'items_requested')::int<>4 or (v_report->>'items_delivered')::int<>3 then
   raise exception 'FAIL: integrated partial-delivery report mismatch: %',v_report;
 end if;
 if (v_report->>'paid_revenue_minor')::bigint<>3000
   or (v_report->>'payment_records_count')::int<>2
   or v_report->>'paid_revenue_status'<>'staff_confirmed_shop_payments_not_provider_reconciled' then
   raise exception 'FAIL: integrated paid ledger report mismatch: %',v_report;
 end if;
 if v_unread<>3 then raise exception 'FAIL: unread alerts expected 3, got %',v_unread; end if;
 raise notice 'PASS | integrated lifecycle: catalogue, order transitions, partial delivery, reservation and stock reconciliation, payment idempotency, overpayment guard, queue and report';
end;
$shop_operational_lifecycle_e2e$;
rollback;
