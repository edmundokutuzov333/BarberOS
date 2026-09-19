# BarberOS V1: Deployment

## Production topology

GitHub main
↓
Vercel
↓
React + Vite
↓
Supabase
  Auth
  PostgreSQL
  RLS + RPC
  Storage
  Realtime
  Edge Functions
  Jobs

Vercel is the frontend delivery layer. Supabase is the system of record and backend execution layer. The browser never receives server-only credentials.

## Vercel

vercel.json defines:

- build from frontend/ with Yarn frozen lockfile;
- static output in frontend/dist;
- SPA fallback to index.html so deep links work on direct navigation;
- immutable caching for Vite assets;
- security headers on application responses.

Production builds use Node 22 and Yarn 1.22.22.

## Supabase

supabase/config.toml pins the production project ref and preserves the authentication mode of every Edge Function.

Production schema release uses:

1. migration contract validation;
2. supabase db push --dry-run;
3. supabase db push;
4. Edge Function deployment from supabase/functions/.

Never run supabase db reset --linked against production.

## Required production secrets

GitHub Actions:

- SUPABASE_ACCESS_TOKEN
- SUPABASE_DB_PASSWORD
- VERCEL_TOKEN
- VERCEL_ORG_ID
- VERCEL_PROJECT_ID
- BARBEROS_PUBLIC_URL

Vercel Production Environment:

- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Any server/runtime variables required by Edge Functions stay in Supabase Secrets or other server-side configuration. They never use the VITE_ namespace.

scripts/validate-deployment-config.mjs rejects suspicious secret-like variables in VITE_.

## Release order

1. Pull request quality gates.
2. Merge to main.
3. Supabase migration release.
4. Edge Function release.
5. Vercel production build and deployment.
6. Production smoke.

## Rollback

rollback-vercel.yml provides an authenticated manual Vercel rollback path. A known-good deployment can be promoted again after recovery.

Operational sequence:

vercel rollback
vercel rollback status
vercel promote <deployment-url>

## Edge Function reconciliation

Production functions:

notify-dispatch
payments-configure
payments-initiate
payments-status
payments-webhook
payments-reconcile
booking-create

All seven active function sources are versioned under supabase/functions/. Future function changes must enter through Git and the Supabase release workflow.

## Credential boundary

The repository contains no Vercel or Supabase private deployment credential. The production deployment jobs are guarded and become active only when the real credentials are supplied through GitHub Actions secrets.
