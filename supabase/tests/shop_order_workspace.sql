begin;
do $test$
declare owner_id uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); shop uuid; other_shop uuid;
 barber uuid; service uuid; customer uuid; appointment uuid; product uuid; variant uuid; order_id uuid; item_id uuid; ready_item uuid; result jsonb; rejected boolean; key uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data) values(owner_id,owner_id||'@example.invalid','{}'),(manager_id,manager_id||'@example.invalid','{}'),(outsider,outsider||'@example.invalid','{}');
 insert into public.barbershops(name,slug,status,timezone) values('Workspace fixture','workspace-'||gen_random_uuid(),'trial','Africa/Maputo') returning id into shop;
 insert into public.barbershops(name,slug,status) values('Other workspace','workspace-other-'||gen_random_uuid(),'trial') returning id into other_shop;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(shop,owner_id,'owner'),(shop,manager_id,'manager'),(other_shop,outsider,'owner');
 insert into public.barbers(barbershop_id,display_name) values(shop,'Workspace barber') returning id into barber;
 insert into public.services(barbershop_id,name,price_cents,duration_min) values(shop,'Workspace service',10000,30) returning id into service;
 insert into public.customers(barbershop_id,name,phone) values(shop,'Workspace customer','workspace-'||gen_random_uuid()) returning id into customer;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
 values(shop,barber,service,customer,'2030-01-02 23:30+00','2030-01-03 00:00+00',30,10000,'confirmed') returning id into appointment;
 insert into public.shop_products(barbershop_id,name,track_stock) values(shop,'Workspace product',false) returning id into product;
 insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,is_active) values(shop,product,'Unidade',100,true) returning id into variant;
 insert into public.appointment_product_orders(barbershop_id,appointment_id,status) values(shop,appointment,'ready') returning id into order_id;
 insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,line_total_snapshot,status,options)
 values(shop,order_id,product,variant,'Workspace product','Unidade',100,3,300,'ready','{"preferences":["Fresca"],"fulfilment_mode":"takeaway"}') returning id into item_id;
 perform set_config('request.jwt.claim.sub',manager_id::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 result:=public.get_shop_order_workspace(shop,null,25,0,'2030-01-03');
 if (result->>'total')::integer<>1 or jsonb_array_length(result->'members')<>2 or result#>>'{orders,0,customer,name}'<>'Workspace customer' or result#>>'{orders,0,items,0,options,preferences,0}'<>'Fresca' then raise exception 'FAIL manager workspace projection'; end if;
 if result::text like '%@example.invalid%' then raise exception 'FAIL staff directory exposes email'; end if;
 if (public.get_shop_order_workspace(shop,null,25,0,'2030-01-02')->>'total')::integer<>0 then raise exception 'FAIL local shop date'; end if;
 if jsonb_array_length(public.get_shop_order_workspace(shop,null,1,1,null)->'orders')<>0 then raise exception 'FAIL pagination'; end if;
 perform public.deliver_shop_order_item(shop,order_id,item_id,1,0,key,null);
 result:=public.deliver_shop_order_item(shop,order_id,item_id,1,0,key,null);
 if not (result->>'idempotent')::boolean or (select delivered_qty from public.appointment_product_order_items where id=item_id)<>1 then raise exception 'FAIL delivery retry'; end if;
 rejected:=false;
 begin perform public.deliver_shop_order_item(shop,order_id,item_id,1,0,gen_random_uuid(),null);exception when serialization_failure then rejected:=sqlerrm='SHOP_DELIVERY_CONFLICT';end;
 if not rejected then raise exception 'FAIL stale delivery'; end if;
 rejected:=false;
 begin perform public.deliver_shop_order_item(shop,order_id,item_id,2,0,key,null);exception when raise_exception then rejected:=sqlerrm='SHOP_OPERATION_KEY_REUSED';end;
 if not rejected then raise exception 'FAIL operation key reused with different quantity'; end if;
 rejected:=false;
 begin perform public.get_shop_order_workspace(shop,null,0,0,null);exception when raise_exception then rejected:=sqlerrm='INVALID_SHOP_ORDER_PAGINATION';end;
 if not rejected then raise exception 'FAIL unbounded pagination'; end if;
 perform public.deliver_shop_order_item(shop,order_id,item_id,2,1,gen_random_uuid(),null);
 if (public.get_shop_order_workspace(shop)->>'total')::integer<>0 or (public.get_shop_order_workspace(shop,'delivered')->>'total')::integer<>1 then raise exception 'FAIL active versus terminal history'; end if;

 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
 values(shop,barber,service,customer,'2030-01-03 02:00+00','2030-01-03 02:30+00',30,10000,'confirmed') returning id into appointment;
 insert into public.appointment_product_orders(barbershop_id,appointment_id,status) values(shop,appointment,'preparing') returning id into order_id;
 insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,line_total_snapshot,status,options)
 values(shop,order_id,product,variant,'Ready article','Unidade',100,1,100,'ready','{}') returning id into ready_item;
 insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,line_total_snapshot,status,options)
 values(shop,order_id,product,variant,'Unavailable article','Unidade',100,1,100,'unavailable','{}') returning id into item_id;
 perform public.deliver_shop_order_item(shop,order_id,ready_item,1,0,gen_random_uuid(),null);
 if (select status from public.appointment_product_orders where id=order_id)<>'partially_delivered' or (select delivered_qty from public.appointment_product_order_items where id=item_id)<>0 then raise exception 'FAIL unavailable article blocks partial fulfillment or is falsely delivered'; end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);rejected:=false;
 begin perform public.get_shop_order_workspace(shop);exception when insufficient_privilege then rejected:=sqlerrm='SHOP_ORDER_FORBIDDEN';end;
 if not rejected then raise exception 'FAIL cross tenant projection'; end if;
 perform set_config('request.jwt.claim.sub','',true);rejected:=false;
 begin perform public.get_shop_order_workspace(shop);exception when insufficient_privilege then rejected:=true;end;
 if not rejected or has_function_privilege('anon','public.get_shop_order_workspace(uuid,text,integer,integer,date)','execute') then raise exception 'FAIL anonymous boundary'; end if;
 raise notice 'PASS workspace: manager projection, minimal directory, local date, pagination, snapshot preferences, delivery retry/stale conflict, terminal history and tenant/anonymous denial';
end;
$test$;
rollback;
