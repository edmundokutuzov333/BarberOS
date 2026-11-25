begin;
do $test$
declare actor uuid:=gen_random_uuid(); sh uuid; sv uuid; br uuid; pr uuid; vr uuid; d date:=(now() at time zone 'Africa/Maputo')::date+3; sl text:='settings-qa-'||replace(gen_random_uuid()::text,'-',''); payload jsonb; n int; rejected boolean;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(actor,'authenticated','authenticated',actor::text||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min) values(sl,'Settings QA','active','Africa/Maputo',0,30,15) returning id into sh;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(sh,actor,'owner');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(sh,'QA service',10000,30,true) returning id into sv;
 insert into public.barbers(barbershop_id,display_name,is_active) values(sh,'QA barber',true) returning id into br;
 insert into public.barber_services(barber_id,service_id) values(br,sv);
 select jsonb_agg(jsonb_build_object('weekday',i,'opens_at','09:00','closes_at','17:00','is_closed',false,'break_start','12:00','break_end','13:00')) into payload from generate_series(0,6)i;
 perform public.replace_working_hours(sh,payload,null);
 if (select count(*) from public.working_hours where barbershop_id=sh and barber_id is null and break_start='12:00')<>7 then raise exception 'FAIL break persistence'; end if;
 if exists(select 1 from private.available_slots_for_duration(sl,sv,br,d,30,null) where (slot_start at time zone 'Africa/Maputo')::time between '11:45' and '12:45') then raise exception 'FAIL break overlap'; end if;
 if not exists(select 1 from private.available_slots_for_duration(sl,sv,br,d,30,null) where (slot_start at time zone 'Africa/Maputo')::time='13:00') then raise exception 'FAIL break boundary'; end if;
 select jsonb_agg(x-'break_start'-'break_end') into payload from jsonb_array_elements(payload)x;
 perform public.replace_working_hours(sh,payload,null);
 if (select count(*) from public.working_hours where barbershop_id=sh and barber_id is null and break_start='12:00')<>7 then raise exception 'FAIL old client pause preservation'; end if;
 insert into public.shop_products(barbershop_id,name,product_kind,track_stock,is_active) values(sh,'QA test product','takeaway',false,false) returning id into pr;
 insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,regular_price_minor,cost_minor,is_active) values(sh,pr,'QA',8000,10000,3000,false) returning id into vr;
 rejected:=false;
 begin update public.shop_product_variants set regular_price_minor=7000 where id=vr; exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'FAIL invalid promo accepted';end if;
 if has_column_privilege('anon','public.shop_product_variants','cost_minor','SELECT') then raise exception 'FAIL cost publicly readable';end if;
 execute 'set local role authenticated';
 if not exists(select 1 from public.shop_product_variants where id=vr and price_minor=8000 and cost_minor=3000) then raise exception 'FAIL owner read';end if;
 execute 'reset role';
end $test$;
rollback;