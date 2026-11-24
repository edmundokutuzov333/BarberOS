begin;
do $test$
declare sh uuid; svc uuid; other uuid; cut uuid; unlinked uuid; barber uuid; booking record; d date := (now() at time zone 'Africa/Maputo')::date+3; start_at timestamptz; slug text := 'offer-test-'||left(gen_random_uuid()::text,8);
begin
  insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
  values(slug,'Offer acceptance fixture','active','Africa/Maputo',30,30,15) returning id into sh;
  insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(sh,'Base offer',25000,30,true) returning id into svc;
  insert into public.services(barbershop_id,name,price_cents,duration_min,is_active) values(sh,'Unrelated offer',8000,10,true) returning id into other;
  insert into public.barbers(barbershop_id,display_name,is_active) values(sh,'Offer fixture barber',true) returning id into barber;
  insert into public.barber_services(barber_id,service_id) values(barber,svc),(barber,other);
  insert into public.haircuts(barbershop_id,service_id,name,price_cents,duration_min,is_active) values(sh,svc,'Long variant',45000,60,true) returning id into cut;
  insert into public.haircuts(barbershop_id,name,is_active) values(sh,'Gallery only',true) returning id into unlinked;
  insert into public.working_hours(barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed) select sh,barber,n,time '09:00',time '11:00',false from generate_series(0,6) n;
  if not exists(select 1 from private.resolve_booking_offer(sh,svc,cut) where price_cents=45000 and duration_min=60) then raise exception 'OFFER_RESOLUTION_FAILED'; end if;
  begin perform * from private.resolve_booking_offer(sh,other,cut); raise exception 'INVALID_PAIR_ACCEPTED'; exception when others then if sqlerrm<>'HAIRCUT_NOT_FOUND' then raise; end if; end;
  begin perform * from private.resolve_booking_offer(sh,svc,unlinked); raise exception 'UNLINKED_ACCEPTED'; exception when others then if sqlerrm<>'HAIRCUT_NOT_FOUND' then raise; end if; end;
  if (select count(*) from public.get_offer_available_slots(slug,svc,barber,d,cut)) >= (select count(*) from public.get_available_slots(slug,svc,barber,d)) then raise exception 'DURATION_NOT_APPLIED'; end if;
  select min(slot_start) into start_at from public.get_offer_available_slots(slug,svc,barber,d,cut);
  select * into booking from public.book_appointment(slug,svc,cut,barber,start_at,'Offer fixture customer','840000019',null);
  if not exists(select 1 from public.appointments a where a.id=booking.appointment_id and a.price_cents=45000 and a.duration_min=60 and a.ends_at=a.starts_at+interval '60 minutes') then raise exception 'SNAPSHOT_NOT_APPLIED'; end if;
  if exists(select 1 from public.get_offer_available_slots(slug,svc,barber,d,cut) where slot_start=start_at+interval '30 minutes') then raise exception 'OVERLAP_ALLOWED'; end if;
  if not exists(select 1 from public.get_appointment_by_token(booking.manage_token) where service_price_cents=45000 and service_duration_min=60) then raise exception 'TOKEN_SNAPSHOT_WRONG'; end if;
  update public.haircuts set price_cents=55000,duration_min=45 where id=cut;
  if not exists(select 1 from public.get_appointment_by_token(booking.manage_token) where service_price_cents=45000 and service_duration_min=60) then raise exception 'HISTORICAL_SNAPSHOT_CHANGED'; end if;
  if has_function_privilege('anon','private.resolve_booking_offer(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','private.available_slots_for_duration(text,uuid,uuid,date,integer,uuid)','EXECUTE') then raise exception 'PRIVATE_ENGINE_EXPOSED'; end if;
end;
$test$;
rollback;
