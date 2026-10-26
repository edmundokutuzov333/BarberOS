# BarberOS booking security release gate

## Purpose

This runbook governs the rollout of the booking hardening, token gateway, and email-first notification changes. Do not certify the release from a successful frontend build alone.

## Preconditions

- [ ] The complete migration chain passes `supabase db reset` on an isolated database.
- [ ] `supabase test db` passes, including `supabase/tests/booking_security.test.sql`.
- [ ] The production migration history has been reconciled against the checked-in files. A migration for version `20260919005227` (`release_audit_appointments_read_model`) has now been restored from the live function definition and grants. The clean reset and `supabase migration list` / `supabase db push --dry-run` must still confirm that no other version differences remain. Do not run `supabase migration repair` or push blindly to silence a difference.
- [ ] A dedicated staging database has the same schema/migration chain and has passed booking, concurrency, token expiry, and notification tests.
- [x] CAPTCHA não faz parte do fluxo de marcação. Não são necessárias chaves de CAPTCHA; manter rate limit, allowlist de origens, idempotência e validação server-side.
- [ ] Supabase runtime secret names `RATE_LIMIT_SALT`, `ALLOWED_ORIGINS`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `NOTIFICATION_EMAIL_FROM` are present. The release workflow checks names only and must never print values. The booking hotfix has a constrained fallback to the server-only service-role key for rate-limit hashing and to the known production Vercel origins for CORS; this fallback does not satisfy release certification, and both explicit runtime secrets must still be provisioned.
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
- Do not deploy the frontend until `/functions/v1/health` and `token-gateway` are live. Token management must fail closed; direct RPC fallbacks are intentionally removed from the current frontend.
- Email-first must not be activated until Resend is verified; do not silently re-enable WhatsApp without an approved provider and policy.

The 23 October 2026 Loja da Barbearia Phase 0 audit is recorded in [BARBEROS_SHOP_PHASE0_READINESS.md](BARBEROS_SHOP_PHASE0_READINESS.md); its gate is NO-GO and this release remains blocked.

## Current known blockers

- The production SPA routing defect was fixed in `frontend/vercel.json`: direct requests to `/entrar`, `/barbearia/magoanine-c`, `/barbearia/magoanine-c/marcar`, and `/marcacao/:token` now return the application shell with the expected security headers. This verifies routing/headers only, not the client-side booking transaction.
- Emergency containment was applied directly to production on 2026-10-19: `EXECUTE` on `public.book_appointment(...)`, `get_payment_runtime_for_token(uuid)`, `get_payment_status_by_token(uuid)`, and `init_payment_from_token(...)` is revoked from `PUBLIC`, `anon`, and `authenticated`; `service_role` retains access. These exact grant changes are present in the checked-in hardening migration, so applying it later is idempotent.
- A clean local Supabase start exposed a malformed phone-validation SQL migration (`20260918153200_booking_phone_validation_strict.sql`). The migration has been repaired on `main`, but the latest clean-reset run must complete before the schema chain is certified.
- The restored historical read-model migration still needs an exact remote migration-list/dry-run comparison before the reconciliation gate can be set.
- Historical Phase 24 results from commit `88f95677562a0278a873f6c4ad15b0fb2e4c4c2f` are not current acceptance evidence. Current workflow logs show `BARBEROS_TEST_DATABASE_URL` and the dedicated HTTP concurrency environment are absent. The PostgreSQL acceptance runners now fail explicitly when the database URL is missing and reject URLs containing the production Supabase project reference before connecting. The CI workflow is configured to run these checks on backend function, migration and configuration changes.
- Production Edge Function inventory checked on 2026-10-23 includes `booking-create v1`, `health v1`, and `token-gateway v1`. `resend-webhook` is still absent; its code in Git is not proof of deployment. Gmail OAuth integration is also not present in the active function inventory.
- A dependência de CAPTCHA foi removida do fluxo público de marcação em 2026-10-26. A ausência de chaves CAPTCHA não bloqueia submissões. O hotfix de 2026-10-26 mantém uma allowlist estrita com fallback apenas para as origens de produção conhecidas e utiliza o segredo server-side existente como fallback de hashing do rate limit; isto é uma medida de continuidade, não substitui a configuração explícita de `ALLOWED_ORIGINS` e `RATE_LIMIT_SALT`. A aceitação continua a exigir schema reconciliado, rate limit, idempotência e testes HTTP/E2E num ambiente dedicado.
- The `BarberOS Remediation Staging` Supabase project exists and is active, but it is not certified as aligned: production shows 110 migration versions, staging 81, while `main` contains 118 SQL migration files. The Phase 23/24/25 Actions also fail because `BARBEROS_TEST_DATABASE_URL` is blank. Provision that dedicated CI secret from a test database, never production.

- The Vercel deployment workflow requires a healthy, versioned Supabase health endpoint and a responding `token-gateway`. The production smoke now falls back to the stable public URL if the optional GitHub `BARBEROS_PUBLIC_URL` secret is absent. The CLI deployment credentials (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) are currently absent in GitHub Actions, so the green deployment job can represent a deliberate skip while the Vercel Git integration deploys separately.
- `.github/workflows/production-monitor.yml` checks public routes/security headers and Supabase health every 15 minutes. A failed run is visible in GitHub Actions; SMS/WhatsApp paging is not configured by this workflow.

Until these blockers are cleared, production must remain uncertified and the gated Supabase production workflow must not be run.
