-- BarberOS Phase 11: manual booking acceptance suite.
-- All booking fixtures are created inside transactions and rolled back.

do $$
declare
  v_owner uuid;
  v_shop uuid;
  v_slug text;
  v_service uuid;
  v_barber uuid;
  v_day date;
  v_start timestamptz;
  v_manual_id uuid;
  v_online_id uuid;
  v_source text;
  v_created_by uuid;
  v_note text;
  v_notifs int;
  v_has_scope_guard boolean;
begin
  if not has_function_privilege('authenticated','public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)','EXECUTE') then
    raise exception 'AUTH_MANUAL_BOOKING_EXECUTE_REQUIRED';
  end if;

  if has_function_privilege('anon','public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)','EXECUTE') then
    raise exception 'ANON_MANUAL_BOOKING_MUST_BE_DENIED';
  end if;

  if has_table_privilege('authenticated','public.appointments','INSERT') then
    raise exception 'DIRECT_APPOINTMENT_INSERT_MUST_BE_REVOKED';
  end if;

  if has_table_privilege('authenticated','public.appointments','UPDATE') then
    raise exception 'DIRECT_APPOINTMENT_UPDATE_MUST_BE_REVOKED';
  end if;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname='book_appointment_core'
      and p.prosecdef
      and p.proconfig @> array['search_path=']
  )
  into v_has_scope_guard;

  if not v_has_scope_guard then
    raise exception 'COMMON_BOOKING_CORE_MUST_BE_PINNED_SECURITY_DEFINER';
  end if;

  select p.prosecdef
  into v_has_scope_guard
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='book_appointment_manual'
    and pg_get_function_identity_arguments(p.oid) = 'p_shop uuid, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_internal_note text';

  if coalesce(v_has_scope_guard,false) is not true then
    raise exception 'MANUAL_RPC_MUST_BE_SECURITY_DEFINER';
  end if;

  select m.user_id,b.id,b.slug,s.id,br.id,d.day,slot.slot_start
  into v_owner,v_shop,v_slug,v_service,v_barber,v_day,v_start
  from public.barbershop_members m
  join public.barbershops b on b.id=m.barbershop_id and b.status in ('active','trial')
  join public.services s on s.barbershop_id=b.id and s.is_active
  join public.barbers br on br.barbershop_id=b.id and br.is_active
  join public.barber_services bs on bs.barber_id=br.id and bs.service_id=s.id
  cross join lateral (
    select gd.day
    from public.get_available_days(b.slug,s.id,br.id,current_date,current_date+30) gd
    where gd.is_open and gd.slots_count > 0
    order by gd.day
    limit 1
  ) d
  cross join lateral (
    select gs.slot_start
    from public.get_available_slots(b.slug,s.id,br.id,d.day) gs
    limit 1
  ) slot
  where m.role='owner'
  limit 1;

  if v_owner is null or v_shop is null or v_service is null or v_barber is null or v_start is null then
    raise exception 'MANUAL_BOOKING_FIXTURE_UNAVAILABLE';
  end if;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,
    true
  );

  select appointment_id
  into v_manual_id
  from public.book_appointment_manual(
    v_shop,
    v_service,
    null,
    v_barber,
    v_start,
    'Phase11 Manual Test',
    '841234567',
    'phase11-test@example.invalid',
    'Cliente no balcão'
  );

  select source::text,created_by,internal_note
  into v_source,v_created_by,v_note
  from public.appointments
  where id=v_manual_id;

  select count(*) into v_notifs
  from public.notifications
  where appointment_id=v_manual_id;

  if v_source <> 'manual' then raise exception 'MANUAL_SOURCE_INVALID'; end if;
  if v_created_by <> v_owner then raise exception 'MANUAL_CREATED_BY_INVALID'; end if;
  if v_note <> 'Cliente no balcão' then raise exception 'MANUAL_INTERNAL_NOTE_INVALID'; end if;
  if v_notifs < 1 then raise exception 'MANUAL_NOTIFICATION_QUEUE_MISSING'; end if;

  set local role postgres;

  select slot_start
  into v_start
  from public.get_available_slots(v_slug,v_service,null,v_day)
  where slot_start is not null
  limit 1;

  if v_start is null then
    raise exception 'ONLINE_REGRESSION_SLOT_UNAVAILABLE';
  end if;

  select appointment_id
  into v_online_id
  from public.book_appointment(
    v_slug,
    v_service,
    null,
    null,
    v_start,
    'Phase11 Online Regression',
    '841234567',
    'phase11-online@example.invalid'
  );

  select source::text,created_by
  into v_source,v_created_by
  from public.appointments
  where id=v_online_id;

  if v_source <> 'online' then raise exception 'ONLINE_SOURCE_CHANGED'; end if;
  if v_created_by is not null then raise exception 'ONLINE_CREATED_BY_CHANGED'; end if;

  raise notice 'PASS | manual source=% actor=% note=% notifications=%; online source=% actor=%',
    'manual',v_owner,v_note,v_notifs,'online',coalesce(v_created_by::text,'null');
end
$$;

select
  has_function_privilege('authenticated','public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)','EXECUTE') as auth_manual_execute,
  not has_function_privilege('anon','public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)','EXECUTE') as anon_manual_denied,
  not has_table_privilege('authenticated','public.appointments','INSERT') as auth_direct_insert_denied,
  not has_table_privilege('authenticated','public.appointments','UPDATE') as auth_direct_update_denied,
  exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='appointments'
  ) as realtime_appointments_intact,
  (select count(*) from public.appointments) as appointments_persisted,
  (select count(*) from public.notifications) as notifications_persisted,
  (select count(*) from public.audit_logs) as audit_logs_persisted;
