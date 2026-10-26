
-- Restore only tenant configuration writes already governed by RLS.
-- Anonymous clients remain read-only.
grant insert, update, delete on public.barbershops,
  public.services,
  public.haircuts,
  public.barbers,
  public.barber_services,
  public.working_hours,
  public.schedule_overrides,
  public.time_blocks
to authenticated;

-- Explicitly keep platform catalog and identity tables out of direct client mutation.
revoke insert, update, delete on public.plans, public.profiles, public.barbershop_members from authenticated, anon;
