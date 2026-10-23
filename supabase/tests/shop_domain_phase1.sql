-- BarberOS | Fase 1 | contratos de domínio
-- Fixtures transaccionais: todos os registos criados por este teste são revertidos.
begin;
do $shop_phase1$
declare
 v_shop uuid; v_other_shop uuid; v_barber uuid; v_service uuid; v_customer uuid; v_appointment uuid;
 v_category uuid; v_product uuid; v_variant uuid; v_other_product uuid; v_other_variant uuid;
 v_order uuid; v_item uuid; v_reservation uuid; v_flag boolean; v_stock integer;
 v_requested_for timestamptz; v_start timestamptz:=now()+interval '90 days'; v_rejected boolean; v_public_tables integer;
begin
 insert into public.barbershops(slug,name,status)
 values('phase1-'||left(replace(gen_random_uuid()::text,'-',''),12),'Shop Phase 1 QA','active')
 returning id,shop_enabled into v_shop,v_flag;
 if v_flag is distinct from false then raise exception 'FAIL: shop_enabled default must be false'; end if;
 insert into public.barbershops(slug,name,status)
 values('phase1-'||left(replace(gen_random_uuid()::text,'-',''),12),'Shop Phase 1 Other Tenant','active')
 returning id into v_other_shop;
 insert into public.barbers(display_name,barbershop_id) values('Barbeiro QA',v_shop) returning id into v_barber;
 insert into public.services(barbershop_id,name,price_cents,duration_min) values(v_shop,'Serviço QA',12000,30) returning id into v_service;
 insert into public.customers(barbershop_id,name,phone)
 values(v_shop,'Cliente QA','phase1-'||left(replace(gen_random_uuid()::text,'-',''),12)) returning id into v_customer;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
 values(v_shop,v_barber,v_service,v_customer,v_start,v_start+interval '30 minutes',30,12000,'confirmed') returning id into v_appointment;
 insert into public.shop_product_categories(barbershop_id,name,is_active) values(v_shop,'Bebidas QA',true) returning id into v_category;
 insert into public.shop_products(barbershop_id,category_id,brand,name,product_kind,track_stock,is_active)
 values(v_shop,v_category,'QA','Água QA','consume_here',true,true) returning id into v_product;
 insert into public.shop_product_variants(barbershop_id,product_id,sku,label,unit_label,price_minor,is_active)
 values(v_shop,v_product,'QA-WATER','500 ml','unidade',1000,true) returning id into v_variant;

 v_rejected:=false;
 begin insert into public.shop_products(barbershop_id,category_id,name) values(v_other_shop,v_category,'Produto cruzado');
 exception when foreign_key_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: category cross-tenant reference was accepted'; end if;
 insert into public.shop_products(barbershop_id,name,track_stock,is_active)
 values(v_other_shop,'Produto Tenant B',true,true) returning id into v_other_product;
 insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,is_active)
 values(v_other_shop,v_other_product,'Unidade',1000,true) returning id into v_other_variant;

 v_rejected:=false;
 begin insert into public.appointment_product_orders(barbershop_id,appointment_id) values(v_other_shop,v_appointment);
 exception when raise_exception then
  if position('SHOP_ORDER_APPOINTMENT_TENANT_MISMATCH' in sqlerrm)>0 then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: order cross-tenant appointment was accepted'; end if;

 insert into public.appointment_product_orders(barbershop_id,appointment_id,customer_note)
 values(v_shop,v_appointment,'Preferência de teste') returning id into v_order;
 select requested_for into v_requested_for from public.appointment_product_orders where id=v_order;
 if v_requested_for is distinct from v_start then raise exception 'FAIL: requested_for not derived from appointment'; end if;

 v_rejected:=false;
 begin insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,options,line_total_snapshot)
 values(v_shop,v_order,v_product,v_other_variant,'Água QA','500 ml',1000,2,'{}',2000);
 exception when foreign_key_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: cross-tenant variant line was accepted'; end if;
 v_rejected:=false;
 begin insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,options,line_total_snapshot)
 values(v_shop,v_order,v_product,v_variant,'Água QA','500 ml',1000,2,'{}',1999);
 exception when check_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: mismatched line total was accepted'; end if;
 insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,options,line_total_snapshot)
 values(v_shop,v_order,v_product,v_variant,'Água QA','500 ml',1000,2,'{}',2000) returning id into v_item;

 perform set_config('request.jwt.claim.role','service_role',true);
 perform public.record_shop_inventory_movement(v_shop,v_variant,5,'opening_balance','phase1 rollback fixture');
 select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
 if v_stock<>5 then raise exception 'FAIL: opening movement did not update stock'; end if;
 v_rejected:=false;
 begin perform public.record_shop_inventory_movement(v_shop,v_variant,-6,'sale','must fail');
 exception when raise_exception then if position('INSUFFICIENT_STOCK' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: sale beyond physical stock was accepted'; end if;

 insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,expires_at)
 values(v_shop,v_order,v_variant,3,now()+interval '1 hour') returning id into v_reservation;
 v_rejected:=false;
 begin insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,expires_at)
 values(v_shop,v_order,v_variant,3,now()+interval '1 hour');
 exception when raise_exception then if position('INSUFFICIENT_AVAILABLE_STOCK' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: over-reservation was accepted'; end if;
 v_rejected:=false;
 begin perform public.record_shop_inventory_movement(v_shop,v_variant,-3,'sale','must not consume reserved stock');
 exception when raise_exception then if position('STOCK_RESERVED' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: movement consumed stock reserved for orders'; end if;
 update public.inventory_reservations set status='released' where id=v_reservation;
 if (select released_at from public.inventory_reservations where id=v_reservation) is null then raise exception 'FAIL: reservation release timestamp missing'; end if;
 perform public.record_shop_inventory_movement(v_shop,v_variant,-3,'sale','phase1 rollback fixture');
 select stock_on_hand into v_stock from public.shop_product_variants where id=v_variant;
 if v_stock<>2 then raise exception 'FAIL: released stock movement total incorrect'; end if;

 v_rejected:=false;
 begin update public.appointment_product_orders set status='delivered' where id=v_order;
 exception when check_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: invalid order transition was accepted'; end if;
 update public.appointment_product_orders set status='accepted' where id=v_order;
 if (select accepted_at from public.appointment_product_orders where id=v_order) is null then raise exception 'FAIL: accepted_at missing'; end if;

 v_rejected:=false;
 begin update public.appointment_product_orders set status='preparing' where id=v_order; -- empty lines still requested here: preparing may start before item acceptance
 exception when others then raise; end;
 v_rejected:=false;
 begin update public.appointment_product_orders set status='ready' where id=v_order;
 exception when raise_exception then if position('SHOP_ORDER_ITEMS_NOT_READY' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: parent order became ready before item lines'; end if;

 v_rejected:=false;
 begin update public.appointment_product_order_items set status='delivered' where id=v_item;
 exception when check_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: invalid item transition was accepted'; end if;
 update public.appointment_product_order_items set status='accepted' where id=v_item;
 update public.appointment_product_order_items set status='preparing' where id=v_item;
 update public.appointment_product_order_items set status='ready' where id=v_item;
 update public.appointment_product_orders set status='ready' where id=v_order;
 if (select ready_at from public.appointment_product_orders where id=v_order) is null then raise exception 'FAIL: ready_at missing'; end if;
 update public.appointment_product_order_items set status='delivered' where id=v_item;
 update public.appointment_product_orders set status='delivered' where id=v_order;
 if (select delivered_at from public.appointment_product_orders where id=v_order) is null then raise exception 'FAIL: delivered_at missing'; end if;

 select count(*) into v_public_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('shop_product_categories','shop_products','shop_product_variants','appointment_product_orders','appointment_product_order_items','inventory_movements','inventory_reservations') and c.relrowsecurity;
 if v_public_tables<>7 then raise exception 'FAIL: RLS missing from one or more shop tables'; end if;
 if has_table_privilege('anon','public.appointment_product_orders','SELECT')
 or has_table_privilege('anon','public.appointment_product_orders','INSERT')
 or has_table_privilege('authenticated','public.appointment_product_orders','INSERT')
 or has_table_privilege('authenticated','public.appointment_product_orders','UPDATE')
 or has_column_privilege('authenticated','public.shop_product_variants','stock_on_hand','UPDATE')
 or has_column_privilege('authenticated','public.shop_product_variants','stock_on_hand','INSERT')
 or has_table_privilege('authenticated','public.shop_product_categories','DELETE')
 or has_table_privilege('authenticated','public.shop_products','DELETE')
 or has_table_privilege('authenticated','public.shop_product_variants','DELETE') then
  raise exception 'FAIL: catalog/order write privilege exceeds contract';
 end if;
end;
$shop_phase1$;
rollback;
