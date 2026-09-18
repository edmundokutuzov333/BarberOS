-- BarberOS Phase 7: anonymous clients consume publication through public RPCs.
revoke select on table public.customers from anon;
revoke select on table public.notifications from anon;
revoke select on table public.waitlist_entries from anon;
revoke select on table public.audit_logs from anon;
revoke select on table public.payments from anon;
revoke select on table public.appointments from anon;
revoke select on table public.barbershops from anon;
revoke select on table public.services from anon;
revoke select on table public.haircuts from anon;
revoke select on table public.barbers from anon;
revoke select on table public.barber_services from anon;
revoke select on table public.working_hours from anon;
revoke select on table public.schedule_overrides from anon;
revoke select on table public.reviews from anon;
