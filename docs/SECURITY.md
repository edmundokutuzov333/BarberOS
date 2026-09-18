# BarberOS Security Hardening

## Fase 1

This repository no longer stores runtime secrets.

Browser configuration uses a publishable Supabase key. Server-side code must use a Supabase secret key supplied by the deployment environment. Legacy `anon` and `service_role` keys are treated as migration-only credentials.

Sensitive operational tables do not accept direct client DML for appointments, payments, notifications, reviews, waitlist entries, or audit logs. Those state transitions must be implemented through controlled database functions or server-side boundaries.

Policy helper functions used by RLS were moved behind the non-exposed `private` schema. The public helper copies remain only for compatibility and have direct execution revoked for `anon` and `authenticated`.

Tenant ownership is immutable on update for all domain tables carrying `barbershop_id`.

All new functions created by the public schema owner must receive explicit execution grants.

## Credential incident status

A legacy Supabase `service_role` credential was present in repository history before this hardening work. The credential must be retired from Supabase after all server consumers are migrated to a new secret API key.

A platform test-account password was also present in repository history. It must be rotated in Supabase Auth.

The available Supabase connector does not expose the Dashboard API-key rotation or Auth leaked-password-protection settings, so those two control-plane operations cannot be completed programmatically from this execution environment.

## Operational rule

Never add real values to `.env` files in Git. Use local untracked files or deployment environment variables.

Never use a production database for mutating QA scripts unless the explicit test guard is enabled.

## References

Supabase recommends publishable keys for browser clients and secret keys for server-side use, and recommends disabling compromised legacy keys after all consumers migrate. See the current Supabase API key documentation.
