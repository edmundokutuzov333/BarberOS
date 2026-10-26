begin;
do $shop_order_payments_phase8$
declare
 v_actor uuid:=gen_random_uuid();v_shop uuid;v_barber uuid;v_service uuid;v_customer uuid;v_appointment uuid;v_order uuid;v_product uuid;v_variant uuid;v_item uuid;
 v_key_one uuid:=gen_random_uuid();v_key_two uuid:=gen_random_uuid();v_result jsonb;v_report jsonb;v_queue jsonb;v_rejected boolean;v_count integer;
 v_day date:=(now() at time zone 'Africa/Maputo')::date;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_actor,'authenticated','authenticated','shop-payment-qa-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
 values('shop-payment-qa-'||left(replace(gen_random_uuid()::text,'-',''),12),'BarberOS Payment QA','active','Africa/Maputo',30,120,15) returning id into v_shop;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
 insert into public.barbers(display_name,barbershop_id,is_active) values('Barbeiro Payment QA',v_shop,true) returning id into v_barber;
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(v_shop,'Serviço Payment QA',10000,30,true) returning id into v_service;
 insert into public.customers(barbershop_id,name,phone) values(v_shop,'Cliente Payment QA','+25884'||substr(replace(gen_random_uuid()::text,'-',''),1,7)) returning id into v_customer;
 insert into public.shop_products(barbershop_id,name,product_kind,track_stock,is_active) values(v_shop,'Produto Payment QA','takeaway',false,false) returning id into v_product;
 insert into public.shop_product_variants(barbershop_id,product_id,label,unit_label,price_minor,is_active) values(v_shop,v_product,'Variante QA','unidade',1000,true) returning id into v_variant;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status)
 values(v_shop,v_barber,v_service,v_customer,now()+interval '90 days',now()+interval '90 days 30 minutes',30,10000,'confirmed') returning id into v_appointment;
 insert into public.appointment_product_orders(barbershop_id,appointment_id,status,delivered_at) values(v_shop,v_appointment,'partially_delivered',now()) returning id into v_order;
 insert into public.appointment_product_order_items(barbershop_id,order_id,product_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,qty,delivered_qty,options,line_total_snapshot,status)
 values(v_shop,v_order,v_product,v_variant,'Produto Payment QA','Variante QA',1000,4,3,'{}'::jsonb,4000,'partially_delivered') returning id into v_item;
 perform set_config('request.jwt.claim.sub',v_actor::text,true);perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 v_result:=public.record_shop_order_payment(v_shop,v_order,1500,'cash','REC-QA-001','Numerário de teste contado e confirmado pela recepção.',v_key_one);
 if (v_result->>'balance_minor')::bigint<>1500 or coalesce((v_result->>'idempotent')::boolean,true) then raise exception 'FAIL: first payment: %',v_result; end if;
 v_result:=public.record_shop_order_payment(v_shop,v_order,1500,'cash','REC-QA-001','Numerário de teste contado e confirmado pela recepção.',v_key_one);
 if coalesce((v_result->>'idempotent')::boolean,false) is not true then raise exception 'FAIL: payment replay not idempotent'; end if;
 v_rejected:=false;
 begin perform public.record_shop_order_payment(v_shop,v_order,1400,'cash','REC-QA-001','Numerário de teste contado e confirmado pela recepção.',v_key_one);
 exception when raise_exception then if position('SHOP_PAYMENT_IDEMPOTENCY_CONFLICT' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: idempotency conflict accepted'; end if;
 v_rejected:=false;
 begin perform public.record_shop_order_payment(v_shop,v_order,1600,'cash','REC-QA-002','Numerário de teste contado e confirmado pela recepção.',gen_random_uuid());
 exception when raise_exception then if position('SHOP_PAYMENT_EXCEEDS_BALANCE' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: overpayment accepted'; end if;
 v_rejected:=false;
 begin perform public.record_shop_order_payment(v_shop,v_order,1500,'mpesa',null,'Confirmação de teste após verificação do canal.',v_key_two);
 exception when raise_exception then if position('SHOP_PAYMENT_REFERENCE_REQUIRED' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: provider payment without reference accepted'; end if;
 v_result:=public.record_shop_order_payment(v_shop,v_order,1500,'mpesa','MPESA-QA-REF-002','Referência e recebimento conferidos num cenário isolado de QA.',v_key_two);
 if (v_result->>'balance_minor')::bigint<>0 then raise exception 'FAIL: balance not cleared'; end if;
 select count(*) into v_count from public.shop_order_payments where barbershop_id=v_shop and order_id=v_order;
 if v_count<>2 then raise exception 'FAIL: expected two records, got %',v_count; end if;
 if has_table_privilege('authenticated','public.shop_order_payments','INSERT') or has_table_privilege('authenticated','public.shop_order_payments','UPDATE') or has_table_privilege('authenticated','public.shop_order_payments','DELETE') then raise exception 'FAIL: direct ledger write allowed'; end if;
 v_queue:=public.get_shop_order_payment_queue(v_shop);
 if jsonb_array_length(v_queue)<>1 or (v_queue->0->>'due_minor')::bigint<>3000 or (v_queue->0->>'paid_minor')::bigint<>3000 or (v_queue->0->>'balance_minor')::bigint<>0 then raise exception 'FAIL: queue mismatch: %',v_queue; end if;
 v_report:=public.get_shop_phase6_report(v_shop,v_day,v_day);
 if (v_report->>'paid_revenue_minor')::bigint<>3000 or (v_report->>'payment_records_count')::int<>2 or v_report->>'paid_revenue_status'<>'staff_confirmed_shop_payments_not_provider_reconciled' then raise exception 'FAIL: report mismatch: %',v_report; end if;
 raise notice 'PASS | payments: delivered amounts, partial/full settlement, idempotency, overpayment guard, audit, RLS, queue and report';
end;
$shop_order_payments_phase8$;
rollback;
