-- BarberOS FASE 23 database contract tests.
-- Read-only.

do $phase23$
declare
  v_name text;
  v_count integer;
  required_tables text[] := array[
    'barbershops','barbershop_members','profiles','services','haircuts',
    'barbers','barber_services','working_hours','time_blocks','schedule_overrides',
    'customers','appointments','waitlist_entries','notifications','payments','reviews','audit_logs'
  ];
  required_functions text[] := array[
    'get_available_days','get_available_slots','book_appointment',
    'get_appointment_by_token','cancel_appointment_by_token','reschedule_appointment_by_token',
    'get_agenda_appointments','get_agenda_schedule','transition_appointment',
    'reschedule_appointment_by_operator','get_customers','get_reviews',
    'get_waitlist','get_waitlist_metrics','get_notification_metrics',
    'get_report_summary','get_report_daily','get_report_services','get_report_haircuts',
    'get_report_barbers','admin_get_overview'
  ];
begin
  foreach v_name in array required_tables loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'PHASE23_TABLE_MISSING:%',v_name;
    end if;
  end loop;

  foreach v_name in array required_functions loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name;
    if v_count=0 then raise exception 'PHASE23_FUNCTION_MISSING:%',v_name; end if;
  end loop;

  foreach v_name in array required_tables loop
    if v_name in ('appointments','payments','notifications','reviews','waitlist_entries','customers','barbershop_members') then
      select count(*) into v_count
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_name and c.relrowsecurity;
      if v_count<>1 then raise exception 'PHASE23_RLS_MISSING:%',v_name; end if;
    end if;
  end loop;

  if has_table_privilege('anon','public.appointments','INSERT')
     or has_table_privilege('anon','public.appointments','UPDATE')
     or has_table_privilege('anon','public.appointments','DELETE')
     or has_table_privilege('authenticated','public.appointments','INSERT')
     or has_table_privilege('authenticated','public.appointments','UPDATE')
     or has_table_privilege('authenticated','public.appointments','DELETE') then
    raise exception 'PHASE23_APPOINTMENT_DIRECT_DML_EXPOSED';
  end if;

  if has_table_privilege('anon','public.payments','SELECT')
     or has_table_privilege('anon','public.notifications','SELECT')
     or has_table_privilege('anon','public.audit_logs','SELECT') then
    raise exception 'PHASE23_PRIVATE_TABLE_PUBLIC_READ_EXPOSED';
  end if;

  if not exists(select 1 from pg_constraint where conname='appointments_no_overlap') then
    raise exception 'PHASE23_OVERLAP_CONSTRAINT_MISSING';
  end if;

  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='appointments') then
    raise exception 'PHASE23_APPOINTMENT_REALTIME_MISSING';
  end if;

  if not has_function_privilege('anon','public.get_available_slots(text,uuid,uuid,date)','execute') then
    raise exception 'PHASE23_AVAILABILITY_PUBLIC_CONTRACT_MISSING';
  end if;

  if not has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','execute') then
    raise exception 'PHASE23_BOOKING_PUBLIC_CONTRACT_MISSING';
  end if;

  if has_function_privilege('anon','public.get_waitlist(uuid,text,text,integer,integer)','execute') then
    raise exception 'PHASE23_PRIVATE_WAITLIST_LIST_EXPOSED';
  end if;

  if has_function_privilege('anon','public.claim_notifications(integer)','execute') then
    raise exception 'PHASE23_PRIVATE_NOTIFICATION_CLAIM_EXPOSED';
  end if;

  raise notice 'PASS | Phase 23 database contract';
end
$phase23$;
