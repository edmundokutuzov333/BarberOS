# BarberOS Supabase

## Structure

`migrations/`
Schema, RLS, engine and security changes. This is the canonical database change history.

`functions/`
Edge Functions for asynchronous integrations and server-side boundaries. They are intentionally introduced only when the corresponding product domain is implemented.

`tests/`
Read-only database acceptance tests and later domain-specific database tests.

`seed/`
Only deterministic non-user reference data belongs here. Do not add fake customers, bookings, payments or reviews.

## Migration policy

Never rename or reorder an already-applied migration.

The current migration chain is:

- 20260918132000 initial_schema
- 20260918132200 rls
- 20260918132400 engine
- 20260918132513 security_hardening

Future changes must receive a new timestamped migration.

## Production rule

No reset, recreate, blind replay, or data-destructive migration is allowed against the live BarberOS database.

All domain writes must respect the existing PostgreSQL and RLS architecture.
