# BarberOS booking security release gate

## Purpose

This runbook governs the rollout of the booking hardening, token gateway, and email-first notification changes. Do not certify the release from a successful frontend build alone.

## Preconditions

- [ ] The complete migration chain passes `supabase db reset` on an isolated database.
- [ ] `supabase test db` passes, including `supabase/tests/booking_security.test.sql`.
- [ ] The production migration history has been reconciled against the checked-in files. A migration for version `20260919005227` (`release_audit_appointments_read_model`) has now been restored from the live function definition and grants. The clean reset and `supabase migration list` / `supabase db push --dry-run` must still confirm that no other version differences remain. Do not run `supabase migration repair` or push blindly to silence a difference.
- [ ] A dedicated staging database has the same schema/migration chain and has passed booking, concurrency, token expiry, and notification tests.
- [ ] Cloudflare Turnstile is configured: public `VITE_TURNSTILE_SITE_KEY` and `VITE_BOOKING_TURNSTILE_REQUIRED=true` in Vercel; `TURNSTILE_SECRET_KEY` in Supabase. The site key must be the production widget key, not a test key.
- [ ] Supabase runtime secret names `RATE_LIMIT_SALT`, `ALLOWED_ORIGINS`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `NOTIFICATION_EMAIL_FROM` are present. The release workflow checks names only and must never print values.
- [ ] Resend sender-domain authentication and webhook signature verification have been tested with a real staging email.
- [ ] A recent database backup and rollback owner are confirmed.

## Release order

1. Inspect `supabase migration list` and `supabase db push --dry-run`. Compare the exact pending versions to the approved release manifest.
2. Apply migrations only after staging acceptance and migration-history reconciliation.
3. Deploy `booking-create`, `token-gateway`, `notify-dispatch`, `health`, and `resend-webhook` from `main`.
4. Verify `/functions/v1/health` returns `ok=true`, numeric `db_ms`, and a version field.
5. Run the dedicated E2E suite: create a real staging booking, retry the same idempotency key, attempt an occupied slot, verify an expired token is rejected, verify public RPC grants are revoked, and trace the confirmation email through Resend's signed webhook into the notification row.
6. Only mark the production release successful when the above checks pass. A skipped test or missing secret is a failure to certify, not a pass.

## Rollback constraints

- Never reset or recreate the production database.
- Do not restore anonymous execution on `book_appointment` as a rollback shortcut. If the new booking Edge Function is unhealthy, restore the last known-good Edge Function version and investigate before changing grants.
- Keep the frontend rollout flag off until the Turnstile site key and server secret are verified. The UI remains compatible with the currently deployed booking function until the coordinated release is ready.
- Email-first must not be activated until Resend is verified; do not silently re-enable WhatsApp without an approved provider and policy.

## Current known blockers

- The production SPA routing defect was fixed in `frontend/vercel.json`: direct requests to `/entrar`, `/barbearia/magoanine-c`, `/barbearia/magoanine-c/marcar`, and `/marcacao/:token` now return the application shell with the expected security headers. This verifies routing/headers only, not the client-side booking transaction.
- Emergency containment was applied directly to production on 2026-10-19: `EXECUTE` on `public.book_appointment(...)`, `get_payment_runtime_for_token(uuid)`, `get_payment_status_by_token(uuid)`, and `init_payment_from_token(...)` is revoked from `PUBLIC`, `anon`, and `authenticated`; `service_role` retains access. These exact grant changes are present in the checked-in hardening migration, so applying it later is idempotent.
- The restored historical read-model migration still needs a successful clean database reset and an exact remote migration-list/dry-run comparison before the reconciliation gate can be set.
- The production Edge Function inventory previously showed `booking-create` v1 and did not include `token-gateway`, `health`, or `resend-webhook`.
- The Vercel project did not list `VITE_TURNSTILE_SITE_KEY` or `VITE_BOOKING_TURNSTILE_REQUIRED` when inspected on 2026-10-19.
- A Supabase staging branch requires explicit cost approval before it can be created. The quoted branch compute cost was US$0.01344/hour.

Until these blockers are cleared, production must remain uncertified and the gated Supabase production workflow must not be run.
