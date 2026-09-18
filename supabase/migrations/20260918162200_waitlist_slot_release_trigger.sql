-- BarberOS Phase 13: automatic waitlist rotation when an appointment releases a slot.
-- This keeps cancellation/reschedule logic unchanged and makes the domain event universal.

create or replace function private.on_appointment_slot_released()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if
    old.status in ('pending','confirmed','in_progress')
    and new.status='cancelled'
  then
    perform private.offer_next_waitlist_core(
      old.barbershop_id,
      old.starts_at,
      old.barber_id
    );
  elsif
    new.status in ('pending','confirmed','in_progress')
    and (
      old.starts_at is distinct from new.starts_at
      or old.barber_id is distinct from new.barber_id
    )
  then
    perform private.offer_next_waitlist_core(
      old.barbershop_id,
      old.starts_at,
      old.barber_id
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists appointments_waitlist_slot_released on public.appointments;

create trigger appointments_waitlist_slot_released
after update of status, starts_at, barber_id
on public.appointments
for each row
execute function private.on_appointment_slot_released();

comment on function private.on_appointment_slot_released()
is 'Domain event bridge: any cancelled or rescheduled active appointment releases its old slot into the waitlist engine.';
