-- BarberOS Phase 5: Booking Engine 2.0 acceptance suite
-- All writes are enclosed in rollback-only blocks. No fixtures persist.

do $$
declare
  v_shop uuid;
  v_slug text;
  v_service uuid;
  v_barber uuid;
  v_slot timestamptz;
  v_appt uuid;
  v_token uuid;
  v_dep int;
  v_needs_payment boolean;
  v_status public.appointment_status;
  v_deposit_state public.deposit_state;
  v_hold timestamptz;
  v_customer_phone text;
  v_notif_count int;
  v_pending_count int;
  v_confirmed_count int;
  v_audit_count int;
  v_second_slot timestamptz;
  v_error text;
  v_appt_baseline int;
  v_notif_baseline int;
  v_audit_baseline int;
begin
  select count(*)::int into v_appt_baseline from public.appointments;
  select count(*)::int into v_notif_baseline from public.notifications;
  select count(*)::int into v_audit_baseline from public.audit_logs;

  select sh.id,sh.slug,s.id,b.id
  into v_shop,v_slug,v_service,v_barber
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
  order by sh.created_at,s.sort_order,b.sort_order
  limit 1;

  if v_shop is null then raise exception 'NO_BOOKING_FIXTURE'; end if;

  select x.slot_start
  into v_slot
  from (
    select d::date as day
    from generate_series(
      (now() at time zone (select timezone from public.barbershops where id=v_shop))::date + 2,
      (now() at time zone (select timezone from public.barbershops where id=v_shop))::date + 7,
      interval '1 day'
    ) as g(d)
  ) days
  cross join lateral public.get_available_slots(
    v_slug,v_service,v_barber,days.day
  ) x
  order by x.slot_start
  limit 1;

  if v_slot is null then raise exception 'NO_BOOKABLE_SLOT'; end if;

  begin
    select appointment_id,manage_token,deposit_cents,needs_payment
    into v_appt,v_token,v_dep,v_needs_payment
    from public.book_appointment(
      v_slug,v_service,null,v_barber,v_slot,
      'Phase 5 Test Customer A','84 000 0011','phase5-a@example.com'
    );

    select a.status,a.deposit_status,a.hold_expires_at,c.phone
    into v_status,v_deposit_state,v_hold,v_customer_phone
    from public.appointments a
    join public.customers c on c.id=a.customer_id
    where a.id=v_appt;

    if v_status <> 'confirmed'
       or v_deposit_state <> 'not_required'
       or v_dep <> 0
       or v_needs_payment
       or v_hold is not null
       or v_customer_phone <> '+258840000011'
       or v_token is null then
      raise exception 'BOOKING_CONFIRMATION_CONTRACT_FAILED';
    end if;

    select count(*) into v_notif_count
    from public.notifications where appointment_id=v_appt;
    if v_notif_count < 2 then
      raise exception 'BOOKING_NOTIFICATIONS_NOT_QUEUED';
    end if;

    select count(*) into v_confirmed_count
    from public.notifications
    where appointment_id=v_appt
      and template_key='appointment_confirmed';
    if v_confirmed_count <> 2 then
      raise exception 'BOOKING_CONFIRMATION_TEMPLATES_FAILED';
    end if;

    select count(*) into v_audit_count
    from public.audit_logs
    where entity_id=v_appt
      and action='appointment_created';
    if v_audit_count <> 1 then
      raise exception 'BOOKING_AUDIT_FAILED';
    end if;

    begin
      perform public.book_appointment(
        v_slug,v_service,null,v_barber,v_slot,
        'Phase 5 Test Customer B','84 000 0012','phase5-b@example.com'
      );
      raise exception 'SAME_SLOT_SECOND_BOOKING_ACCEPTED';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error <> 'SLOT_TAKEN' then raise; end if;
    end;

    raise exception 'ROLLBACK_SUCCESS_BOOKING_TEST';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'ROLLBACK_SUCCESS_BOOKING_TEST' then raise; end if;
  end;

  begin
    update public.barbershops
    set deposit_enabled=true,
        deposit_mode='fixed',
        deposit_value=5000
    where id=v_shop;

    update public.services
    set requires_deposit=true
    where id=v_service;

    select x.slot_start
    into v_second_slot
    from (
      select d::date as day
      from generate_series(
        (now() at time zone (select timezone from public.barbershops where id=v_shop))::date + 2,
        (now() at time zone (select timezone from public.barbershops where id=v_shop))::date + 7,
        interval '1 day'
      ) as g(d)
    ) days
    cross join lateral public.get_available_slots(
      v_slug,v_service,v_barber,days.day
    ) x
    order by x.slot_start
    limit 1;

    if v_second_slot is null then
      raise exception 'NO_BOOKABLE_DEPOSIT_SLOT';
    end if;

    select appointment_id,manage_token,deposit_cents,needs_payment
    into v_appt,v_token,v_dep,v_needs_payment
    from public.book_appointment(
      v_slug,v_service,null,v_barber,v_second_slot,
      'Phase 5 Deposit Customer','84 000 0013','phase5-deposit@example.com'
    );

    select a.status,a.deposit_status,a.hold_expires_at
    into v_status,v_deposit_state,v_hold
    from public.appointments a
    where a.id=v_appt;

    if v_status <> 'pending'
       or v_deposit_state <> 'awaiting'
       or v_dep <> 5000
       or not v_needs_payment
       or v_hold is null
       or v_hold <= now() then
      raise exception 'BOOKING_DEPOSIT_CONTRACT_FAILED';
    end if;

    select count(*) into v_pending_count
    from public.notifications
    where appointment_id=v_appt
      and template_key='appointment_pending';
    if v_pending_count <> 2 then
      raise exception 'BOOKING_PENDING_TEMPLATES_FAILED';
    end if;

    select count(*) into v_confirmed_count
    from public.notifications
    where appointment_id=v_appt
      and template_key='appointment_confirmed';
    if v_confirmed_count <> 0 then
      raise exception 'PENDING_BOOKING_EMITS_CONFIRMED_TEMPLATE';
    end if;

    raise exception 'ROLLBACK_DEPOSIT_BOOKING_TEST';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'ROLLBACK_DEPOSIT_BOOKING_TEST' then raise; end if;
  end;

  begin
    perform public.book_appointment(
      v_slug,v_service,null,v_barber,v_slot,
      'Phase 5 Invalid Phone','12345','phase5-invalid@example.com'
    );
    raise exception 'INVALID_PHONE_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'INVALID_PHONE' then raise; end if;
  end;

  begin
    select id,customer_id into v_appt,v_customer_phone
    from public.appointments
    where barbershop_id=v_shop
      and status='confirmed'
    order by starts_at
    limit 1;

    if v_appt is null then raise exception 'NO_COMPLETION_FIXTURE'; end if;

    declare
      v_visits_before int;
      v_review_before int;
    begin
      select visits_count into v_visits_before
      from public.customers where id=(select customer_id from public.appointments where id=v_appt);

      select count(*) into v_review_before
      from public.notifications
      where appointment_id=v_appt and template_key='review_request';

      update public.appointments
      set status='completed'
      where id=v_appt;

      if not exists(select 1 from public.appointments where id=v_appt and completed_at is not null) then
        raise exception 'COMPLETION_TIMESTAMP_FAILED';
      end if;

      if (select visits_count from public.customers where id=(select customer_id from public.appointments where id=v_appt))
         <> v_visits_before+1 then
        raise exception 'CUSTOMER_VISIT_COUNTER_FAILED';
      end if;

      if (select count(*) from public.notifications where appointment_id=v_appt and template_key='review_request')
         <> v_review_before+1 then
        raise exception 'REVIEW_REQUEST_NOT_QUEUED';
      end if;

      raise exception 'ROLLBACK_COMPLETION_TRIGGER_TEST';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error <> 'ROLLBACK_COMPLETION_TRIGGER_TEST' then raise; end if;
    end;
  end;

  begin
    select id into v_appt
    from public.appointments
    where barbershop_id=v_shop
      and status='confirmed'
    order by starts_at
    limit 1;

    if v_appt is null then raise exception 'NO_NO_SHOW_FIXTURE'; end if;

    declare
      v_no_show_before int;
    begin
      select no_show_count into v_no_show_before
      from public.customers
      where id=(select customer_id from public.appointments where id=v_appt);

      update public.appointments
      set status='no_show'
      where id=v_appt;

      if not exists(select 1 from public.appointments where id=v_appt and no_show_at is not null) then
        raise exception 'NO_SHOW_TIMESTAMP_FAILED';
      end if;

      if (select no_show_count from public.customers where id=(select customer_id from public.appointments where id=v_appt))
         <> v_no_show_before+1 then
        raise exception 'CUSTOMER_NO_SHOW_COUNTER_FAILED';
      end if;

      raise exception 'ROLLBACK_NO_SHOW_TRIGGER_TEST';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error <> 'ROLLBACK_NO_SHOW_TRIGGER_TEST' then raise; end if;
    end;
  end;

  if v_appt_baseline <> (select count(*) from public.appointments) then
    raise exception 'APPOINTMENT_FIXTURE_PERSISTED';
  end if;

  if v_notif_baseline <> (select count(*) from public.notifications) then
    raise exception 'NOTIFICATION_FIXTURE_PERSISTED';
  end if;

  if v_audit_baseline <> (select count(*) from public.audit_logs) then
    raise exception 'AUDIT_FIXTURE_PERSISTED';
  end if;

  if not (
    has_function_privilege(
      'anon',
      'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)',
      'execute'
    )
    and has_function_privilege(
      'authenticated',
      'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)',
      'execute'
    )
    and not has_table_privilege('anon','public.appointments','INSERT')
    and not has_table_privilege('authenticated','public.appointments','INSERT')
    and not has_function_privilege(
      'anon',
      'public.enqueue_appointment_notifications(uuid)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.enqueue_appointment_notifications(uuid)',
      'execute'
    )
  ) then
    raise exception 'BOOKING_SECURITY_GRANTS_FAILED';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'book_appointment',
        'enqueue_appointment_notifications',
        'on_appointment_completed'
      )
      and p.prosecdef
      and not ('search_path=""'=any(coalesce(p.proconfig,'{}'::text[])))
  ) then
    raise exception 'BOOKING_SEARCH_PATH_NOT_PINNED';
  end if;

  raise notice 'PASS | Phase 5 Booking Engine 2.0';
end
$$;
