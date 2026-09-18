-- BarberOS Phase 10: enable Supabase Postgres Changes for operational appointments.
-- The Realtime boundary remains tenant-scoped by the existing appointments RLS policy.
-- waitlist_entries and notifications are intentionally not published in this phase.

alter publication supabase_realtime add table public.appointments;
