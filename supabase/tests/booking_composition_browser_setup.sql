-- Local CI only. Do not apply to a remote Supabase project.
do $fixture$
declare sh uuid; s uuid; a uuid; h uuid; b uuid; u uuid;
begin
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min) values('composition-browser-qa','Composition Browser QA','active','Africa/Maputo',30,30,15) returning id into sh;
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(sh,'Corte QA',25000,30,true) returning id into s;
 insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(sh,'Lavagem QA',8000,15,true) returning id into a;
 insert into public.service_addons(barbershop_id,service_id,addon_service_id) values(sh,s,a);
 insert into public.haircuts(barbershop_id,service_id,name,price_cents,duration_min,is_active,skill_restricted) values(sh,s,'Fade QA',30000,45,true,true) returning id into h;
 insert into public.barbers(barbershop_id,display_name,is_active) values(sh,'Barbeiro Qualificado QA',true) returning id into b;
 insert into public.barbers(barbershop_id,display_name,is_active) values(sh,'Barbeiro Sem Complemento QA',true) returning id into u;
 insert into public.barber_services(barber_id,service_id) values(b,s),(b,a),(u,s);
 insert into public.haircut_barber_skills(barbershop_id,haircut_id,barber_id) values(sh,h,b);
 insert into public.working_hours(barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed) select sh,x.id,n,time '09:00',time '19:00',false from (values(b),(u)) x(id) cross join generate_series(0,6)n;
end;
$fixture$;
