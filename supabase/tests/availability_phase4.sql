-- BarberOS Phase 4: read-only and rollback-only availability acceptance
do $$
declare
  v_shop uuid;
  v_slug text;
  v_service uuid;
  v_barber uuid;
  v_user uuid;
  v_day date;
  v_slot timestamptz;
  v_duration int;
  v_slots int;
  v_open boolean;
  v_override uuid;
  v_test_service uuid;
  v_customer uuid;
  v_appt uuid;
  v_original_interval int;
begin
  select sh.id, sh.slug, s.id, b.id, m.user_id, s.duration_min
    into v_shop,v_slug,v_service,v_barber,v_user,v_duration
  from public.barbershops sh
  join public.services s on s.barbershop_id=sh.id and s.is_active
  join public.barber_services bs on bs.service_id=s.id
  join public.barbers b on b.id=bs.barber_id and b.barbershop_id=sh.id and b.is_active
  join public.barbershop_members m on m.barbershop_id=sh.id and m.role in ('owner','manager')
  where sh.status in ('active','trial')
    and sh.max_advance_days >= 14
  order by sh.created_at,s.sort_order,b.sort_order
  limit 1;

  if v_shop is null then raise exception 'NO_AVAILABILITY_FIXTURE'; end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user::text,'role','authenticated')::text,
    true
  );

  select min(d)::date into v_day
  from generate_series(
    ((now() at time zone (select timezone from public.barbershops where id=v_shop))::date + 1),
    ((now() at time zone (select timezone from public.barbershops where id=v_shop))::date + 14),
    interval '1 day'
  ) d
  where exists (
    select 1
    from public.working_hours wh
    where wh.barbershop_id=v_shop
      and wh.weekday=extract(dow from d)::int
      and not wh.is_closed
      and wh.closes_at > wh.opens_at
  );

  if v_day is null then raise exception 'NO_OPEN_TEST_DAY'; end if;

  select count(*) into v_slots
  from public.get_available_slots(v_slug,v_service,v_barber,v_day);

  if v_slots=0 then raise exception 'BASE_AVAILABILITY_FAILED'; end if;

  select slot_start into v_slot
  from public.get_available_slots(v_slug,v_service,v_barber,v_day)
  order by slot_start limit 1;

  select count(*),coalesce(bool_and(is_open),false)
    into v_slots,v_open
  from public.get_available_days(v_slug,v_service,v_barber,v_day,v_day);

  if v_slots=0 or not v_open then raise exception 'AVAILABLE_DAYS_CONTRACT_FAILED'; end if;

  select count(*) into v_slots
  from public.get_available_slots(v_slug,v_service,v_barber,
    (now() at time zone (select timezone from public.barbershops where id=v_shop))::date
    + (select max_advance_days + 1 from public.barbershops where id=v_shop));

  if v_slots <> 0 then raise exception 'ADVANCE_WINDOW_FAILED'; end if;

  begin
    perform public.save_schedule_override(
      v_shop,v_day,null,false,'11:00','10:00','other','invalid-test',null
    );
    raise exception 'INVALID_OVERRIDE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'INVALID_OVERRIDE_HOURS' then raise; end if;
  end;

  begin
    perform public.save_schedule_override(
      v_shop,v_day,null,true,null,null,'holiday','shop-close-test',null
    ) into v_override;

    select count(*) into v_slots
    from public.get_available_slots(v_slug,v_service,v_barber,v_day);
    if v_slots <> 0 then raise exception 'SHOP_CLOSED_OVERRIDE_FAILED'; end if;

    select count(*),coalesce(bool_and(is_open),false)
      into v_slots,v_open
    from public.get_available_days(v_slug,v_service,v_barber,v_day,v_day);
    if v_slots<>0 or v_open then raise exception 'DAY_METADATA_CLOSED_OVERRIDE_FAILED'; end if;

    perform public.save_schedule_override(
      v_shop,v_day,v_barber,false,'09:00','18:00','other','barber-open-test',v_override
    );

    select count(*) into v_slots
    from public.get_available_slots(v_slug,v_service,v_barber,v_day);

    if v_slots=0 then raise exception 'BARBER_OVERRIDE_PRECEDENCE_FAILED'; end if;

    raise exception 'ROLLBACK_OVERRIDE_TEST';
  exception when others then
    if sqlerrm <> 'ROLLBACK_OVERRIDE_TEST' then raise; end if;
  end;

  begin
    insert into public.services(barbershop_id,name,price_cents,duration_min,sort_order)
    values(v_shop,'Phase 4 Test Service',100,40,999)
    returning id into v_test_service;

    insert into public.barber_services(barber_id,service_id)
    values(v_barber,v_test_service);

    select slot_interval_min into v_original_interval
    from public.barbershops where id=v_shop;

    update public.barbershops
    set slot_interval_min=15
    where id=v_shop;

    perform public.save_schedule_override(
      v_shop,v_day,v_barber,false,'10:00','12:00','other','40min-test',null
    );

    select slot_start into v_slot
    from public.get_available_slots(v_slug,v_test_service,v_barber,v_day)
    where slot_start=((v_day::timestamp + time '10:00') at time zone (select timezone from public.barbershops where id=v_shop))
    limit 1;

    if v_slot is null then raise exception 'FORTY_MINUTE_10_00_MISSING'; end if;

    if exists (
      select 1
      from public.get_available_slots(v_slug,v_test_service,v_barber,v_day)
      where slot_start in (
        ((v_day::timestamp + time '10:15') at time zone (select timezone from public.barbershops where id=v_shop)),
        ((v_day::timestamp + time '10:30') at time zone (select timezone from public.barbershops where id=v_shop))
      )
    ) then
      raise exception 'FORTY_MINUTE_OVERLAP_FAILED';
    end if;

    raise exception 'ROLLBACK_40MIN_TEST';
  exception when others then
    if sqlerrm <> 'ROLLBACK_40MIN_TEST' then raise; end if;
  end;

  begin
    select slot_start into v_slot
    from public.get_available_slots(v_slug,v_service,v_barber,v_day)
    order by slot_start limit 1;

    insert into public.customers(barbershop_id,name,phone)
    values(v_shop,'Phase 4 Rollback Customer','+258820000001')
    returning id into v_customer;

    insert into public.appointments(
      barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,
      duration_min,price_cents,status,deposit_status,deposit_cents,hold_expires_at,source
    )
    values(
      v_shop,v_barber,v_service,v_customer,v_slot,v_slot+make_interval(mins=>v_duration),
      v_duration,100,'pending','awaiting',100,now()-interval '1 minute','manual'
    )
    returning id into v_appt;

    select count(*) into v_slots
    from public.get_available_slots(v_slug,v_service,v_barber,v_day)
    where slot_start=v_slot;

    if v_slots <> 1 then raise exception 'EXPIRED_PENDING_STILL_BLOCKS'; end if;

    update public.appointments set status='confirmed' where id=v_appt;

    select count(*) into v_slots
    from public.get_available_slots(v_slug,v_service,v_barber,v_day)
    where slot_start=v_slot;

    if v_slots <> 0 then raise exception 'CONFIRMED_APPOINTMENT_NOT_BLOCKING'; end if;

    raise exception 'ROLLBACK_APPOINTMENT_OCCUPANCY_TEST';
  exception when others then
    if sqlerrm <> 'ROLLBACK_APPOINTMENT_OCCUPANCY_TEST' then raise; end if;
  end;

  raise notice 'PASS | Phase 4 Availability Engine 2.0 | baseline, advance window, overrides, day metadata, 40-minute overlap and appointment occupancy verified';
end
$$;
