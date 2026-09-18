-- BarberOS Phase 9: operational agenda engine.



CREATE OR REPLACE FUNCTION private.require_agenda_access(p_shop uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  if private.is_platform_admin() then
    return;
  end if;

  if private.is_member(
    p_shop,
    array['owner','manager','barber']::public.app_role[]
  ) then
    return;
  end if;

  raise exception 'SHOP_OPERATOR_REQUIRED';
end;
$function$




















revoke all on function public.get_agenda_appointments(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_agenda_appointments(uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.get_agenda_schedule(uuid,date,date) from public,anon,authenticated;
grant execute on function public.get_agenda_schedule(uuid,date,date) to authenticated;
revoke all on function public.transition_appointment(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_appointment(uuid,uuid,text,text) to authenticated;
revoke all on function public.reschedule_appointment_by_operator(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.reschedule_appointment_by_operator(uuid,uuid,timestamptz) to authenticated;
comment on function public.get_agenda_appointments(uuid,timestamptz,timestamptz) is 'Tenant-scoped operational agenda read model. Owner/manager see tenant appointments; barber sees only own appointments.';
comment on function public.get_agenda_schedule(uuid,date,date) is 'Tenant-scoped operational schedule read model resolving barber/date overrides before weekly schedule.';
comment on function public.transition_appointment(uuid,uuid,text,text) is 'Transactional appointment state machine for operators: confirm, start, complete, no_show, cancel.';
comment on function public.reschedule_appointment_by_operator(uuid,uuid,timestamptz) is 'Transactional operator reschedule for a future pending/confirmed appointment using the same availability engine.'