-- Phase 22: configuration writes remain available only to authenticated users.
grant insert, update, delete on public.barbershops,
  public.services,
  public.haircuts,
  public.barbers,
  public.barber_services,
  public.working_hours,
  public.schedule_overrides,
  public.time_blocks
to authenticated;

revoke insert, update, delete on public.plans, public.profiles, public.barbershop_members
from authenticated, anon;
