# BarberOS Payment Simulator

Admin-only laboratory for M-Pesa. No network request to an operator, real PIN,
credentials, actual phone number or money. The existing global live payment
gate stays disabled. The lab models four payment purposes (deposit, service,
product, subscription) against a selected reference shop, but **never** changes
the live appointments, order/payment ledgers, stock or subscriptions. This is
not a certification of the real M-Pesa adapter or a real booking integration.

## Architecture and operation
- Private PostgreSQL run and event ledgers, RLS enabled and no browser grants.
- Single transactional RPC checks authoritative platform admin (including the
  password-rotation boundary), lab gate, actor ownership, payload and transition.
- Create operations serialize per actor; event operations lock the run; retries
  reuse the request UUID; conflicting reuse is rejected. Events are append-only
  through the RPC, bounded to 100 per run; create rate is 30/min per admin.
- Edge function authenticates the user and forwards their JWT to the RPC, not a
  privileged service key. The browser validates response shape with Zod.
- Admin > Pagamentos > BarberOS Payment Simulator. Set
  VITE_PAYMENT_SIMULATOR_ENABLED=true for local/preview builds (the known staging
  project also shows the panel). The backend gate is authoritative.
- Migration starts disabled everywhere. Enable only on staging using
  `update private.payment_simulator_settings set enabled=true where singleton;`.
  Disable using the same statement with false; do not alter platform_settings.
- CI executes rollback-only PostgreSQL acceptance, Edge typecheck, frontend
  checks. Test fixtures are not persisted; no production database release is
  required to use staging. A real provider Sandbox requires separate certification.

## Scenarios
Create, confirm, reconcile, refund, repeat callback. Success, insufficient funds,
cancel, invalid number, pending, timeout, provider error, repeated callback and
late success (refund required instead of granting simulated entitlement).

## Boundaries
The simulator uses a private ledger and simulated entitlement; the real booking
and store checkout remain gated. Production remains disabled by default.
No subscription billing contract or actual provider authentication is implied.

## Staging release evidence (2026-11-24)
- Versioned source migration `20261124140000_payment_simulator.sql` applied through
  Supabase management API; remote migration version `20261124142017`. Do not
  repair the ledger by rewriting timestamps. Capture: `docs/contracts/payment-simulator-staging.json`.
- Edge version 3 ACTIVE, JWT verification enabled; staging ledger enabled while
  global live payments remain disabled. Production database unchanged.
- Separate Vercel project `barberos-payment-lab` uses only staging public URL and
  publishable key. Access: https://barberos-payment-lab.vercel.app/admin/pagamentos
  (Vercel access protection and eligible staging admin login required).
- SQL acceptance executed in staging and rolled back. The HTTP and concurrency
  suite passed in the isolated CI stack (run 45414426881, job 138516661444).
- Controlled browser regression remains separate from the production-build
  browser suite using local Supabase Auth and the actual Edge function, without
  mocked network responses. Both run in CI. The published staging smoke tests
  only the public transport/authorization boundary; it is not an authenticated
  transaction test.
- The staging project had no eligible admin at verification; live authenticated
  browser certification requires legitimate staging account provisioning.

## Provision an authorized staging admin (owner operation)
1. Open the staging project's Authentication > Users in the Supabase dashboard.
   Invite an authorized tester, verify the invitation, and set their password
   using the supported Auth flow. Never copy production passwords or tokens.
2. Confirm that the new user has a matching profile. An authorized project owner
   should explicitly assign the platform admin role in staging, using the
   verified user UUID and existing admin provisioning process. Do not promote
   arbitrary existing staging users or alter production roles.
3. Sign into the protected lab URL, open Pagamentos, and run the timeout,
   reconciliation, refund, and callback replay scenario. Refresh and confirm
   the persisted event timeline. Sign out and confirm access is denied.
4. Record the release commit, timestamp, run reference (SIM prefix), and test
   result without credentials. Production payments remain disabled.

Security advisor informational notices for the three private RLS tables without
policies are intentional deny-by-default. The public RPC is SECURITY DEFINER
and callable by authenticated users, but it checks private.require_platform_admin
and actor ownership on every action. Direct non-admin calls are tested. Do not
add permissive table policies or remove the internal role checks to silence a lint.
