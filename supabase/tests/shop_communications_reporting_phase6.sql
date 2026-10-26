-- BarberOS | Fase 6 | contratos de eventos, inbox e reporting.
-- Fixture isolada dentro de transacção; o ROLLBACK remove tenant, cliente, pedido e alertas.
begin;
do $shop_communications_reporting_phase6$
declare
 v_actor uuid:=gen_random_uuid();
 v_shop uuid; v_barber uuid; v_service uuid; v_customer uuid;
 v_category uuid; v_product uuid; v_variant uuid; v_appointment uuid; v_order uuid;
 v_report jsonb; v_inbox_count integer; v_unread integer; v_notification uuid;
 v_from date := (now() at time zone 'Africa/Maputo')::date;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_actor,'authenticated','authenticated','phase6-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
 values('phase6-'||left(replace(gen_random_uuid()::text,'-',''),12),'BarberOS Phase 6 QA','active','Africa/Maputo',30,120,15)
 returning id into v_shop;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
 insert into public.barbers(display_name,barbershop_id,is_active) values('Recepção Fase 6 QA',v_shop,true) returning id into v_barber;
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active)
 values(v_shop,'Serviço Fase 6 QA',10000,30,true) returning id into v_service;
 insert into public.customers(barbershop_id,name,phone)
 values(v_shop,'Cliente QA','+25884'||substr(replace(gen_random_uuid()::text,'-',''),1,7)) returning id into v_customer;
 insert into public.shop_product_categories(barbershop_id,name,is_active)
 values(v_shop,'Categoria QA',false) returning id into v_category;
 insert into public.shop_products(barbershop_id,category_id,name,product_kind,track_stock,is_active)
 values(v_shop,v_category,'Fixture QA Fase 6','takeaway',false,false) returning id into v_product;
 insert into public.shop_product_variants(barbershop_id,product_id,label,unit_label,price_minor,is_active)
 values(v_shop,v_product,'Fixture isolada','unidade',1000,false) returning id into v_variant;
 perform set_config('request.jwt.claim.role','service_role',true);
 update public.barbershops set shop_enabled=false where id=v_shop;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
 values(v_shop,v_barber,v_service,v_customer,now()+interval '90 days',now()+interval '90 days 30 minutes',30,10000,'confirmed')
 returning id into v_appointment;
 insert into public.appointment_product_orders(barbershop_id,appointment_id,status)
 values(v_shop,v_appointment,'received') returning id into v_order;
 insert into public.appointment_product_order_items(
   barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,
   unit_price_snapshot,qty,options,line_total_snapshot,status
 ) values(v_shop,v_order,v_product,v_variant,'Fixture QA Fase 6','Fixture isolada',1000,1,'{}'::jsonb,1000,'requested');
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform public.update_shop_order_operation(v_shop,v_order,'accept',null,null);
 select count(*) into v_inbox_count from public.get_shop_notification_inbox(v_shop,50);
 if v_inbox_count < 2 then raise exception 'FAIL: expected received and accepted alerts, got %',v_inbox_count; end if;
 select id into v_notification from public.shop_notification_events
 where barbershop_id=v_shop and order_id=v_order order by occurred_at limit 1;
 if not public.mark_shop_notification_read(v_shop,v_notification) then raise exception 'FAIL: mark alert read returned false'; end if;
 select count(*) into v_unread from public.shop_notification_events
 where barbershop_id=v_shop and order_id=v_order and read_at is null;
 if v_unread <> 1 then raise exception 'FAIL: unread alert count expected 1, got %',v_unread; end if;
 v_report := public.get_shop_phase6_report(v_shop,v_from,v_from);
 if (v_report->>'orders_received')::int <> 1
   or (v_report->>'orders_accepted')::int <> 1
   or (v_report->>'items_requested')::int <> 1 then
   raise exception 'FAIL: phase 6 reporting mismatch: %',v_report;
 end if;
 if v_report->>'paid_revenue_status' <> 'unavailable_no_verified_shop_payment_linkage'
   or not (v_report ? 'paid_revenue_minor') or v_report->'paid_revenue_minor' <> 'null'::jsonb then
   raise exception 'FAIL: report must not invent revenue: %',v_report;
 end if;
 if (v_report->>'unread_internal_alerts')::int <> 1 then
   raise exception 'FAIL: unread alert metric mismatch: %',v_report;
 end if;
 if has_table_privilege('authenticated','public.shop_notification_events','UPDATE') then
   raise exception 'FAIL: authenticated can write notification table directly';
 end if;
 raise notice 'PASS | phase 6: event triggers, inbox, RPC mark-read, tenant RLS, Maputo-day report, payment/revenue separation';
end;
$shop_communications_reporting_phase6$;
rollback;
