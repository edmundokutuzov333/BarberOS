-- BarberOS Phase 6: appointment token management acceptance suite
-- All mutations are rollback-only and selected fixture counts must remain unchanged.

do $$
declare
  v_token uuid;
  v_appt uuid;
  v_shop uuid;
  v_slug text;
  v_barber uuid;
  v_service uuid;
  v_old_start timestamptz;
  v_candidate timestamptz;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_view jsonb;
  v_status text;
  v_can_cancel boolean;
  v_can_reschedule boolean;
  v_customer_name text;
  v_notif_before int;
  v_audit_before int;
  v_notif_after int;
  v_audit_after int;
  v_rule public.cancellation_rule;
  v_error text;
begin
  select a.manage_token,a.id,a.barbershop_id,a.barber_id,a.service_id,a.starts_at,sh.slug,sh.cancellation_rule
  into v_token,v_appt,v_shop,v_barber,v_service,v_old_start,v_slug,v_rule
  from public.appointments a
  join public.barbershops sh on sh.id=a.barbershop_id
  where a.status='confirmed'
  order by a.created_at desc
  limit 1;

  if v_token is null then raise exception 'NO_TOKEN_FIXTURE'; end if;

  select to_jsonb(x) into v_view
  from public.get_appointment_by_token(v_token) x
  limit 1;
  if v_view is null then raise exception 'TOKEN_VIEW_EMPTY'; end if;
  if v_view ? 'id' or v_view ? 'appointment_id' or v_view ? 'customer_id' or v_view ? 'barber_id' or v_view ? 'barbershop_id' then
    raise exception 'TOKEN_VIEW_LEAKS_INTERNAL_ID';
  end if;

  select customer_name,appointment_status::text,can_cancel,can_reschedule
  into v_customer_name,v_status,v_can_cancel,v_can_reschedule
  from public.get_appointment_by_token(v_token);
  if v_customer_name is null or v_status<>'confirmed' or not v_can_cancel or not v_can_reschedule then
    raise exception 'TOKEN_VIEW_ACTION_CONTRACT_FAILED';
  end if;

  select x.slot_start
  into v_candidate
  from public.get_reschedule_slots_by_token(v_token,(v_old_start at time zone (select timezone from public.barbershops where id=v_shop))::date) x
  where x.slot_start<>v_old_start
  order by x.slot_start
  limit 1;
  if v_candidate is null then raise exception 'NO_RESCHEDULE_CANDIDATE'; end if;

  select to_jsonb(x) into v_view
  from public.get_reschedule_slots_by_token(v_token,(v_old_start at time zone (select timezone from public.barbershops where id=v_shop))::date) x
  limit 1;
  if v_view ? 'id' or v_view ? 'barber_id' or v_view ? 'service_id' then raise exception 'SLOT_VIEW_LEAKS_INTERNAL_ID'; end if;

  select count(*) into v_notif_before from public.notifications where appointment_id=v_appt;
  select count(*) into v_audit_before from public.audit_logs where entity_id=v_appt;

  begin
    select new_starts_at,new_ends_at into v_new_start,v_new_end
    from public.reschedule_appointment_by_token(v_token,v_candidate);
    if v_new_start<>v_candidate or v_new_end<=v_new_start then raise exception 'RESCHEDULE_RETURN_FAILED'; end if;
    if not exists(select 1 from public.notifications where appointment_id=v_appt and template_key='appointment_rescheduled' and status='queued') then
      raise exception 'RESCHEDULE_NOTIFICATION_FAILED';
    end if;
    if not exists(select 1 from public.audit_logs where entity_id=v_appt and action='appointment_rescheduled') then
      raise exception 'RESCHEDULE_AUDIT_FAILED';
    end if;
    begin
      perform public.book_appointment(v_slug,v_service,null,v_barber,v_new_start,'Token Collision','84 000 0099',null);
      raise exception 'RESCHEDULED_SLOT_NOT_PROTECTED';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error<>'SLOT_TAKEN' then raise; end if;
    end;
    raise exception 'ROLLBACK_RESCHEDULE';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error<>'ROLLBACK_RESCHEDULE' then raise; end if;
  end;

  begin
    select cancelled_at into v_new_start
    from public.cancel_appointment_by_token(v_token,'Cliente pediu cancelamento');
    if v_new_start is null then raise exception 'CANCEL_RETURN_FAILED'; end if;
    if not exists(select 1 from public.appointments where id=v_appt and status='cancelled' and cancelled_at is not null) then
      raise exception 'CANCEL_STATUS_FAILED';
    end if;
    if not exists(select 1 from public.notifications where appointment_id=v_appt and template_key='appointment_cancelled' and status='queued') then
      raise exception 'CANCEL_NOTIFICATION_FAILED';
    end if;
    if exists(select 1 from public.notifications where appointment_id=v_appt and status='queued' and template_key in ('reminder_24h','reminder_1h')) then
      raise exception 'CANCELLED_REMINDER_STILL_QUEUED';
    end if;
    if not exists(select 1 from public.audit_logs where entity_id=v_appt and action='appointment_cancelled') then
      raise exception 'CANCEL_AUDIT_FAILED';
    end if;
    select count(*) into v_notif_after from public.notifications where appointment_id=v_appt;
    select count(*) into v_audit_after from public.audit_logs where entity_id=v_appt;
    if v_notif_after<=v_notif_before or v_audit_after<=v_audit_before then raise exception 'CANCEL_SIDE_EFFECTS_FAILED'; end if;
    raise exception 'ROLLBACK_CANCEL';
  exception when others then
    get stacked diagnostics v_error=message_text;
    if v_error<>'ROLLBACK_CANCEL' then raise; end if;
  end;

  begin
    update public.barbershops set cancellation_rule='contact_only' where id=v_shop;
    begin
      perform public.cancel_appointment_by_token(v_token,null);
      raise exception 'CONTACT_ONLY_CANCEL_ACCEPTED';
    exception when others then
      get stacked diagnostics v_error=message_text;
      if v_error<>'CANCELLATION_POLICY_CONTACT_ONLY' then raise; end if;
    end;
    update public.barbershops set cancellation_rule=v_rule where id=v_shop;
  end;

  begin
    perform public.get_appointment_by_token('00000000-0000-0000-0000-000000000000');
    if found then raise exception 'INVALID_TOKEN_VIEW_ACCEPTED'; end if;
  end;

  if (select count(*) from public.appointments)<>1 or (select count(*) from public.notifications)<>2 or (select count(*) from public.audit_logs)<>1 then
    raise exception 'TOKEN_TEST_FIXTURE_PERSISTED';
  end if;

  raise notice 'PASS | Phase 6 appointment token management';
end
$$;

select
  has_function_privilege('anon','public.get_appointment_by_token(uuid)','execute') as anon_view_execute,
  has_function_privilege('anon','public.get_reschedule_slots_by_token(uuid,date)','execute') as anon_slots_execute,
  has_function_privilege('anon','public.cancel_appointment_by_token(uuid,text)','execute') as anon_cancel_execute,
  has_function_privilege('anon','public.reschedule_appointment_by_token(uuid,timestamptz)','execute') as anon_reschedule_execute,
  not has_table_privilege('anon','public.appointments','SELECT') as anon_no_direct_appointment_select,
  (select count(*) from public.appointments) as appointments,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.audit_logs) as audit_logs;