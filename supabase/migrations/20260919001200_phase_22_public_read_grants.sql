-- Phase 22: public booking must retain anonymous read access to published shop data.
grant select on public.barbershops, public.services, public.haircuts,
  public.barbers, public.barber_services, public.working_hours, public.reviews
to anon;
