-- BarberOS Phase 8: public booking wizard backend acceptance.
-- Every booking is rollback-only. No fixtures persist.

do $$
declare
  v_shop uuid;
  v_slug text;
  v_service uuid;
  v_haircut uuid;
  v_barber uuid;
  v_start timestamptz;
  v_appointment uuid;
  v_token uuid;
  v_day date;
  v_error text;
  v_appt_before int;
  v_customer_before int;
  v_notifications_before int;
  v_audit_before int;
  v_days jsonb;
  v_slots jsonb;
begin
  select count(*)::int into v_appt_before from public.appointments;
  select count(*)::int into v_customer_before from public.customers;
  select count(*)::int into v_notifications_before from public.notifications;
  select count(*)::int into v_audit_before from public.audit_logs;

  select sh.id, sh.slug, s.id, b.id
  into v_shop, v_slug, v_service, v_barber
  from public.barbershops sh
  join public.services s
    on s.barbershop_id=sh.id
   and s.is_active
  join public.barber_services bs
    on bs.service_id=s.id
  join public.barbers b
    on b.id=bs.barber_id
   and b.barbershop_id=sh.id
   and b.is_active
  where sh.status in ('active','trial')
  order by sh.created_at, s.sort_order, b.sort_order
  limit 1;

  if v_shop is null then raise exception 'NO_PUBLIC_BOOKING_FIXTURE'; end if;

  select d.day
  into v_day
  from public.get_available_days(
    v_slug,
    v_service,
    null,
    (now() at time zone (select timezone from public.barbershops where id=v_shop))::date,
    (now() at time zone (select timezone from public.barbershops where id=v_shop))::date
      + (select max_advance_days from public.barbershops where id=v_shop)
  ) d
  where d.is_open and d.slots_count > 0
  order by d.day
  limit 1;

  if v_day is null then raise exception 'NO_REAL_AVAILABLE_DAY'; end if;

  select jsonb_agg(to_jsonb(x)) into v_slots
  from (
    select * from public.get_available_slots(v_slug,v_service,null,v_day)
    order by slot_start
    limit 3
  ) x;

  if v_slots is null or jsonb_array_length(v_slots)=0 then
    raise exception 'NO_REAL_AVAILABLE_SLOT'; 
  end if;

  select slot_start, (barber_ids)[1]
  into v_start, v_barber
  from public.get_available_slots(v_slug,v_service,null,v_day)
  order by slot_start
  limit 1;

  if v_start is null or v_barber is null then
    raise exception 'ANY_BARBER_RESOLUTION_FAILED';
  end if;

  select h.id
  into v_haircut
  from public.haircuts h
  where h.barbershop_id=v_shop
    and h.is_active
    and (h.service_id is null or h.service_id=v_service)
  order by h.sort_order, h.name
  limit 1;

  begin
    select appointment_id, manage_token
    into v_appointment, v_token
    from public.book_appointment(
      v_slug,
      v_service,
      v_haircut,
      null,
      v_start,
      'Phase 8 Wizard Customer',
      '84 000 0088',
      'phase8-wizard@example.com'
    );

    if v_appointment is null or v_token is null then
      raise exception 'BOOKING_RESULT_INVALID';
    end if;

    if not exists (
      select 1
      from public.appointments
      where id=v_appointment
        and barbershop_id=v_shop
        and barber_id=v_barber
        and service_id=v_service
        and (haircut_id=v_haircut or (haircut_id is null and v_haircut is null))
        and starts_at=v_start
        and source='online'
        and status in ('confirmed','pending')
    ) then
      raise exception 'BOOKING_RECORD_CONTRACT_FAILED';
    end if;

    if not exists (
      select 1
      from public.appointments a
      join public.customers c on c.id=a.customer_id
      where a.id=v_appointment
        and c.barbershop_id=v_shop
        and c.phone='+258840000088'
        and c.name='Phase 8 Wizard Customer'
    ) then
      raise exception 'CUSTOMER_UPSERT_FAILED';
    end if;

    if not exists (
      select 1 from public.notifications
      where appointment_id=v_appointment
    ) then
      raise exception 'WIZARD_NOTIFICATION_QUEUE_FAILED';
    end if;

    if not exists (
      select 1 from public.audit_logs
      where entity_id=v_appointment and action='appointment_created'
    ) then
      raise exception 'WIZARD_AUDIT_FAILED';
    end if;

    begin
      perform public.book_appointment(
        v_slug,v_service,v_haircut,v_barber,v_start,
        'Phase 8 Wizard Customer B','84 000 0089','phase8-wizard-b@example.com'
      );
      raise exception 'CONCURRENT_SLOT_ACCEPTED';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error <> 'SLOT_TAKEN' then raise; end if;
    end;

    raise exception 'ROLLBACK_PHASE8_BOOKING';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'ROLLBACK_PHASE8_BOOKING' then raise; end if;
  end;

  if v_appt_before <> (select count(*) from public.appointments) then
    raise exception 'APPOINTMENT_PERSISTED';
  end if;

  if v_customer_before <> (select count(*) from public.customers) then
    raise exception 'CUSTOMER_PERSISTED';
  end if;

  if v_notifications_before <> (select count(*) from public.notifications) then
    raise exception 'NOTIFICATION_PERSISTED';
  end if;

  if v_audit_before <> (select count(*) from public.audit_logs) then
    raise exception 'AUDIT_PERSISTED';
  end if;

  if not (
    has_function_privilege('anon','public.get_public_barbershop(text)','execute')
    and has_function_privilege('anon','public.get_available_days(text,uuid,uuid,date,date)','execute')
    and has_function_privilege('anon','public.get_available_slots(text,uuid,uuid,date)','execute')
    and has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','execute')
    and not has_table_privilege('anon','public.appointments','INSERT')
  ) then
    raise exception 'PUBLIC_BOOKING_SECURITY_FAILED';
  end if;

  raise notice 'PASS | Phase 8 public booking backend contract';
end
$$;

select
  has_function_privilege('anon','public.get_public_barbershop(text)','execute') as anon_public_shop,
  has_function_privilege('anon','public.get_available_days(text,uuid,uuid,date,date)','execute') as anon_days,
  has_function_privilege('anon','public.get_available_slots(text,uuid,uuid,date)','execute') as anon_slots,
  has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','execute') as anon_booking,
  not has_table_privilege('anon','public.appointments','INSERT') as anon_no_direct_booking_insert,
  (select count(*) from public.appointments) as appointments,
  (select count(*) from public.customers) as customers,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.audit_logs) as audit_logs;
