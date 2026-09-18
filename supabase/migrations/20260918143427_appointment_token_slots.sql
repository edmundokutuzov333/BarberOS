create or replace function public.get_reschedule_slots_by_token(p_token uuid,p_date date)
returns table(slot_start timestamptz)
language plpgsql security definer set search_path=''
as $fn$
declare
  a public.appointments%rowtype; sh public.barbershops%rowtype; v_deadline timestamptz;
begin
  select * into a from public.appointments where manage_token=p_token limit 1;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  select * into sh from public.barbershops where id=a.barbershop_id;
  if a.status not in ('pending','confirmed') or a.starts_at<=now() then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE'; end if;
  if sh.cancellation_rule='contact_only' then raise exception 'CANCELLATION_POLICY_CONTACT_ONLY'; end if;
  v_deadline:=a.starts_at;
  if sh.cancellation_rule='flex_2h' then v_deadline:=a.starts_at-interval '2 hours';
  elsif sh.cancellation_rule='moderate_6h' then v_deadline:=a.starts_at-interval '6 hours';
  elsif sh.cancellation_rule='strict_24h' then v_deadline:=a.starts_at-interval '24 hours';
  end if;
  if now()>v_deadline then raise exception 'CANCELLATION_POLICY_LOCKED'; end if;
  if a.deposit_status='awaiting' and a.hold_expires_at is not null and a.hold_expires_at<=now() then raise exception 'BOOKING_HOLD_EXPIRED'; end if;
  return query select x.slot_start from public.get_available_slots(sh.slug,a.service_id,a.barber_id,p_date) x order by x.slot_start;
end;
$fn$;

revoke all on function public.get_reschedule_slots_by_token(uuid,date) from public,anon,authenticated;
grant execute on function public.get_reschedule_slots_by_token(uuid,date) to anon,authenticated;
