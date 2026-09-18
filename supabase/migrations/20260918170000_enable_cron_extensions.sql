-- BarberOS Phase 15: enable scheduling primitives.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
