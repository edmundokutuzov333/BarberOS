-- BarberOS Phase 9: operational agenda acceptance.
-- Mutation scenarios use rollback-only blocks. No persistent fixtures are created.

do $$
declare
  v_shop uuid;
  v_appt uuid;
  v_start timestamptz;
  v_error text;
  v_appt_before int;
  v_notif_before int;
  v_audit_before int;
  v_completed_before int;
  v_no_show_before int;
  v_future_start timestamptz;
begin
  select id into v_shop
  from public.barbershops
  order by created_at
  limit 1;

  select id,starts_at into v_appt,v_start
  from public.appointments
  where barbershop_id=v_shop
  order by starts_at
  limit 1;

  if v_shop is null then raise exception 'NO_SHOP'; end if;
  if v_appt is null then raise exception 'NO_APPOINTMENT'; end if;

  select count(*)::int into v_appt_before from public.appointments;
  select count(*)::int into v_notif_before from public.notifications;
  select count(*)::int into v_audit_before from public.audit_logs;

  begin
    perform public.get_agenda_appointments(
      v_shop,
      v_start - interval '1 day',
      v_start + interval '1 day'
    );
    raise exception 'UNAUTHENTICATED_AGENDA_READ_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'SHOP_OPERATOR_REQUIRED' then
      raise;
    end if;
  end;

  begin
    perform public.transition_appointment(
      v_shop,v_appt,'complete',null
    );
    raise exception 'UNAUTHENTICATED_APPOINTMENT_MUTATION_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'SHOP_OPERATOR_REQUIRED' then
      raise;
    end if;
  end;

  begin
    perform public.reschedule_appointment_by_operator(
      v_shop,v_appt,v_start + interval '30 minutes',null
    );
    raise exception 'UNAUTHENTICATED_RESCHEDULE_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'SHOP_OPERATOR_REQUIRED' then
      raise;
    end if;
  end;

  begin
    perform public.transition_appointment(v_shop,v_appt,'invalid_action',null);
    raise exception 'INVALID_ACTION_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'INVALID_APPOINTMENT_ACTION' then
      raise;
    end if;
  end;

  begin
    perform public.reschedule_appointment_by_operator(v_shop,v_appt,null);
    raise exception 'NULL_RESCHEDULE_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'INVALID_DATE' then
      raise;
    end if;
  end;

  begin
    perform public.get_agenda_appointments(
      v_shop,
      now() - interval '1 day',
      now() + interval '15 days'
    );
    raise exception 'LARGE_AGENDA_RANGE_ACCEPTED';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error <> 'AGENDA_RANGE_TOO_LARGE' then
      raise;
    end if;
  end;

  if v_appt_before <> (select count(*) from public.appointments)
     or v_notif_before <> (select count(*) from public.notifications)
     or v_audit_before <> (select count(*) from public.audit_logs) then
    raise exception 'PHASE9_TEST_PERSISTED_DATA';
  end if;

  raise notice 'PASS | Phase 9 operator boundary and validation guards';
end
$$;

select
  has_function_privilege('authenticated','public.get_agenda_appointments(uuid,timestamptz,timestamptz)','execute') as auth_agenda_read,
  has_function_privilege('authenticated','public.get_agenda_schedule(uuid,date,date)','execute') as auth_schedule_read,
  has_function_privilege('authenticated','public.transition_appointment(uuid,uuid,text,text)','execute') as auth_transition,
  has_function_privilege('authenticated','public.reschedule_appointment_by_operator(uuid,uuid,timestamptz)','execute') as auth_reschedule,
  not has_function_privilege('anon','public.get_agenda_appointments(uuid,timestamptz,timestamptz)','execute') as anon_no_agenda_read,
  not has_function_privilege('anon','public.get_agenda_schedule(uuid,date,date)','execute') as anon_no_schedule_read,
  not has_function_privilege('anon','public.transition_appointment(uuid,uuid,text,text)','execute') as anon_no_transition,
  has_function_privilege('authenticated','public.reschedule_appointment_by_operator(uuid,uuid,timestamptz,uuid)','execute') as auth_cross_barber_reschedule,
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='reschedule_appointment_by_operator'
      and pg_get_function_identity_arguments(p.oid)='p_shop uuid, p_appointment uuid, p_new_start timestamp with time zone'
  ) as old_reschedule_signature_removed,
  not has_function_privilege('anon','public.reschedule_appointment_by_operator(uuid,uuid,timestamptz,uuid)','execute') as anon_no_reschedule,
  not has_table_privilege('authenticated','public.appointments','UPDATE') as auth_no_direct_update,
  not has_table_privilege('anon','public.appointments','UPDATE') as anon_no_direct_update,
  not has_table_privilege('anon','public.appointments','SELECT') as anon_no_direct_select,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('get_agenda_appointments','get_agenda_schedule','transition_appointment','reschedule_appointment_by_operator')
      and p.prosecdef
      and 'search_path=""'=any(coalesce(p.proconfig,'{}'::text[]))
  ) as agenda_functions_pinned,
  (select count(*) from public.appointments) as appointments,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.audit_logs) as audit_logs;
