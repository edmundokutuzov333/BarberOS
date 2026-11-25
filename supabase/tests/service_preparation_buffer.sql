begin;
do $test$
declare actor uuid:=gen_random_uuid(); sh uuid; sv uuid; br uuid; cu uuid; ap uuid; d date:=(now() at time zone 'Africa/Maputo')::date+3; sl text:='buffer-qa-'||replace(gen_random_uuid()::text,'-',''); payload jsonb; rejected boolean;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(actor,'authenticated','authenticated',actor::text||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min) values(sl,'Buffer QA','active','Africa/Maputo',0,30,15) returning id into sh;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(sh,actor,'owner');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(sh,'QA service',10000,30,true) returning id into sv;
 insert into public.barbers(barbershop_id,display_name,is_active) values(sh,'QA barber',true) returning id into br;
 insert into public.barber_services(barber_id,service_id) values(br,sv);
 select jsonb_agg(jsonb_build_object('weekday',i,'opens_at','09:00','closes_at','17:00','is_closed',false)) into payload from generate_series(0,6)i;
 perform public.replace_working_hours(sh,payload,null);
 insert into public.customers(barbershop_id,name,phone) values(sh,'QA customer','+258840000001') returning id into cu;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status) values(sh,br,sv,cu,(d+time '10:00') at time zone 'Africa/Maputo',(d+time '10:30') at time zone 'Africa/Maputo',30,10000,'confirmed') returning id into ap;
 execute 'set local role authenticated';
 update public.barbershops set service_buffer_min=15 where id=sh;
 if (select service_buffer_min from public.barbershops where id=sh)<>15 then raise exception 'FAIL buffer persistence';end if;
 execute 'reset role';
 if exists(select 1 from private.available_slots_for_duration(sl,sv,br,d,30,null) where (slot_start at time zone 'Africa/Maputo')::time in ('09:30','10:30')) then raise exception 'FAIL buffer overlaps';end if;
 if (select count(*) from private.available_slots_for_duration(sl,sv,br,d,30,null) where (slot_start at time zone 'Africa/Maputo')::time in ('09:15','10:45'))<>2 then raise exception 'FAIL buffer boundaries';end if;
 if not exists(select 1 from private.available_slots_for_duration(sl,sv,br,d,30,ap) where (slot_start at time zone 'Africa/Maputo')::time='10:00') then raise exception 'FAIL reschedule exclusion';end if;
 update public.barbershops set service_buffer_min=0 where id=sh;
 if (select count(*) from private.available_slots_for_duration(sl,sv,br,d,30,null) where (slot_start at time zone 'Africa/Maputo')::time in ('09:30','10:30'))<>2 then raise exception 'FAIL zero buffer';end if;
 rejected:=false;begin update public.barbershops set service_buffer_min=121 where id=sh;exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'FAIL invalid buffer';end if;
 if not exists(select 1 from public.appointments where id=ap and duration_min=30 and price_cents=10000) then raise exception 'FAIL historical appointment changed';end if;
end $test$;
rollback;