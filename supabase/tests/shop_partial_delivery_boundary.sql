-- Real order trigger and inbox RPC; synthetic tenant, no payments/providers.
begin;
do $test$
declare
  actor uuid:=gen_random_uuid(); shop uuid:=gen_random_uuid();
  barber uuid:=gen_random_uuid(); service uuid:=gen_random_uuid();
  customer uuid:=gen_random_uuid(); appointment uuid:=gen_random_uuid();
  v_order uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); notices integer;
begin
  insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{}');
  insert into public.barbershops(id,slug,name,status)
    values(shop,'partial-'||replace(shop::text,'-',''),'Partial delivery fixture','trial');
  insert into public.barbershop_members(barbershop_id,user_id,role) values(shop,actor,'owner');
  insert into public.barbers(id,barbershop_id,display_name) values(barber,shop,'Fixture barber');
  insert into public.services(id,barbershop_id,name,price_cents,duration_min) values(service,shop,'Fixture service',10000,30);
  insert into public.customers(id,barbershop_id,name,phone) values(customer,shop,'Fixture customer','+258841234567');
  insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
    values(appointment,shop,barber,service,customer,now()+interval '90 days',now()+interval '90 days 30 minutes',30,10000,'confirmed');
  insert into public.appointment_product_orders(id,barbershop_id,appointment_id,status)
    values(v_order,shop,appointment,'preparing');
  insert into public.shop_products(id,barbershop_id,name,is_active) values(product,shop,'Fixture product',false);
  insert into public.shop_product_variants(id,barbershop_id,product_id,label,price_minor)
    values(variant,shop,product,'Fixture unit',1000);
  -- Start from an existing partial line; this test targets notification emission,
  -- while shop_operational_lifecycle_e2e separately covers stock/delivery writes.
  insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,
    product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,delivered_qty,line_total_snapshot,status)
    values(shop,v_order,product,variant,'Fixture product','Fixture unit',1000,2,1,2000,'partially_delivered');
  update public.appointment_product_orders set status='partially_delivered' where id=v_order;
  select count(*) into notices from public.shop_notification_events n
    where n.order_id=v_order and n.barbershop_id=shop and event_type='order_partially_delivered';
  if notices<>1 then raise exception 'PARTIAL_DELIVERY_ALERT_MISSING'; end if;
  -- An unchanged status update must not duplicate the alert.
  update public.appointment_product_orders set status='partially_delivered' where id=v_order;
  select count(*) into notices from public.shop_notification_events n
    where n.order_id=v_order and n.barbershop_id=shop and event_type='order_partially_delivered';
  if notices<>1 then raise exception 'PARTIAL_DELIVERY_ALERT_DUPLICATED'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from public.get_shop_notification_inbox(shop,50) n
    where n.order_id=v_order and n.event_type='order_partially_delivered') then
    raise exception 'PARTIAL_DELIVERY_INBOX_MISSING';
  end if;
end;
$test$;
reset role;
rollback;
select 'PARTIAL_DELIVERY_BOUNDARY_PASSED' as result;
