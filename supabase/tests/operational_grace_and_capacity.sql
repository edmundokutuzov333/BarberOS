begin;
do $qa$
declare actor uuid:=gen_random_uuid(); sh uuid; br uuid; sv uuid; cu uuid; ap uuid; d date:=(now() at time zone 'Africa/Maputo')::date+3; rejected boolean; cap numeric;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(actor,'authenticated','authenticated',actor::text||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
 insert into public.barbershops(slug,name,status,timezone,late_grace_min) values('policy-qa-'||replace(gen_random_uuid()::text,'-',''),'Policy QA','active','Africa/Maputo',15) returning id into sh;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(sh,actor,'owner');
 perform set_config('request.jwt.claim.sub',actor::text,true); perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.barbers(barbershop_id,display_name,is_active) values(sh,'QA barber',true) returning id into br;
 insert into public.services(barbershop_id,name,duration_min,price_cents,is_active) values(sh,'QA service',30,10000,true) returning id into sv;
 insert into public.customers(barbershop_id,name,phone,email) values(sh,'QA customer','+258840000001','qa@example.invalid') returning id into cu;
 insert into public.working_hours(barbershop_id,weekday,opens_at,closes_at,is_closed,break_start,break_end) values(sh,extract(dow from d), '09:00','17:00',false,'12:00','13:00');
 insert into public.working_hours(barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed,break_start,break_end) values(sh,br,extract(dow from d),'09:00','17:00',false,'12:30','13:30');
 select capacity_minutes into cap from private.report_capacity_by_day(sh,d,d,br);
 if cap is distinct from 390 then raise exception 'FAIL capacity union %',cap;end if;
 insert into public.appointments(barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,duration_min,price_cents,status) values(sh,br,sv,cu,now()-interval '5 minutes',now()+interval '25 minutes',30,10000,'confirmed') returning id into ap;
 rejected:=false;begin perform public.transition_appointment(sh,ap,'no_show',null);exception when raise_exception then if sqlerrm='APPOINTMENT_TRANSITION_INVALID' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL grace';end if;
 update public.barbershops set late_grace_min=0 where id=sh;
 perform public.transition_appointment(sh,ap,'no_show',null);
 if not exists(select 1 from public.appointments where id=ap and status='no_show') then raise exception 'FAIL eligible no_show';end if;
end $qa$;
rollback;