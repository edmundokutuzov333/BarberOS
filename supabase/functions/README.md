# BarberOS Edge Functions

Edge Functions are the server-side boundary for asynchronous integrations and external providers.

Planned domains:
- notification dispatch
- hold expiration
- waitlist rotation
- payment initiation
- payment webhooks
- daily digest

No Edge Function is introduced merely to move existing synchronous domain logic out of PostgreSQL.

Credentials used by Edge Functions must come from Supabase project secrets or deployment environment configuration, never from the repository.
