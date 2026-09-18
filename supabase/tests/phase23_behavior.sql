-- BarberOS FASE 23 behavior contract.
-- Rollback-only.

begin;

do $phase23$
declare
  v_shop uuid; v_slug text; v_service uuid; v_barber uuid;
  v_day date; v_slot timestamptz; v_after boolean;
begin
  select b.id,b.slug into v_shop,v_slug
  from public.barbershops b where b.status in ('trial','active')
  order by b.created_at limit 1;
  if v_shop is null then raise exception 'PHASE23_FIXTURE_SHOP_UNAVAILABLE'; end if;

  select s.id,br.id into v_service,v_barber
  from public.services s
  join public.barber_services bs on bs.service_id=s.id
  join public.barbers br on br.id=bs.barber_id and br.is_active
  where s.barbershop_id=v_shop and s.is_active
  order by s.sort_order,br.sort_order limit 1;
  if v_service is null or v_barber is null then raise exception 'PHASE23_FIXTURE_SERVICE_OR_BARBER_UNAVAILABLE'; end if;

  select d.day into v_day
  from public.get_available_days(v_slug,v_service,v_barber,current_date+1,current_date+30) d
  where d.is_open and d.slots_count > 0 order by d.day limit 1;
  if v_day is null then raise exception 'PHASE23_FIXTURE_DAY_UNAVAILABLE'; end if;

  select s.slot_start into v_slot
  from public.get_available_slots(v_slug,v_service,v_barber,v_day) s
  order by s.slot_start limit 1;
  if v_slot is null then raise exception 'PHASE23_FIXTURE_SLOT_UNAVAILABLE'; end if;

  perform public.book_appointment(v_slug,v_service,null,v_barber,v_slot,'Phase 23 rollback fixture','+258841234598',null);

  select exists(select 1 from public.get_available_slots(v_slug,v_service,v_barber,v_day) where slot_start=v_slot) into v_after;
  if v_after then raise exception 'PHASE23_BOOKING_DID_NOT_REMOVE_SLOT'; end if;

  raise notice 'PASS | availability -> booking -> slot invalidation';
end
$phase23$;

rollback;
