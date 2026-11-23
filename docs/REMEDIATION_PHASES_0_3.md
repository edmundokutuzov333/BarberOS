# Production foundations — execution ledger

## Scope and architecture decision

Execution started on 2026-11-23 from main `acd76a50048713307d06493034ca85f90100b797`.
Published commits are append-only because the connected editor consumes main.

Three approaches were evaluated:

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| Replace migration chain with a baseline | Simplifies fresh installations | Loses historical traceability; rejected for the connected production project |
| Patch each deployed function independently | Small immediate edits | Duplicates browser contracts and permits drift; rejected as the long-term architecture |
| Incremental migrations and shared HTTP contracts | Preserves history and makes browser boundaries testable | Requires live schema reconciliation; selected |

## Environments confirmed

| Environment | Resource | Evidence / limitation |
| --- | --- | --- |
| Source | edmundokutuzov333/BarberOS, main | GitHub API access confirmed; direct non-force ref updates |
| Production API | alseiinjzwjdiwtvkdzy | Supabase dashboard identifies BarberOS in Oryon Txuna-Bet, eu-west-2 |
| Staging API | asikuyxaapcmayptimxi | Dashboard lists BarberOS Remediation Staging; schema parity remains unverified |
| Production UI | https://barber-os-orpin.vercel.app | Public UI and API requests verified during audit |
| Backups | Production dashboard | Shows no scheduled backup; restoration procedure must be established before schema changes |

The available MCP account links do not currently authorize the production project.
Account reconnection was requested. Do not infer schema parity from a dated snapshot.

## Verified defect and repair

Production admin logs show `TypeError: Response with null body status cannot have body`.
The OPTIONS handler constructed HTTP 204 with a non-null body. Shared `preflight()`
now returns a bodyless 204. `browserCors()` preserves official origins, supports an
explicit staging allowlist, omits allow-origin for untrusted origins and sets Vary.
Payment configure, initiation and status use request-scoped headers to avoid
cross-request leakage. Authentication and domain authorization remain in place.

Validation: 19 Deno tests pass, including signature replay protection, booking
domain error contracts, trusted/untrusted origins and bodyless preflight. Deno
typechecking of all four changed entrypoints passes. CI runs the boundary tests.

## Deployment certification

Run the read-only certification against each environment:

```sh
BARBEROS_SUPABASE_URL=https://alseiinjzwjdiwtvkdzy.supabase.co \
BARBEROS_PUBLIC_URL=https://barber-os-orpin.vercel.app \
node scripts/verify-edge-runtime.mjs
```

This checks live function presence, health, allowed browser headers and origin
isolation. It must fail on missing functions or runtime faults. It does not prove
email delivery, OAuth refresh, payment settlement or database equivalence.

## Outstanding acceptance gates

- Phase 0: complete service inventory, secret-name inventory, backup and restore evidence.
- Phase 1: refresh remote migration history and SQL definitions; compare and reconcile
  production and staging without rewriting their history; restore into an isolated
  database and run SQL acceptance tests before applying incremental migrations.
- Phase 2: regenerate database types from the reconciled schema; verify every frontend
  RPC/function contract and authenticated permission boundary.
- Phase 3: deploy corrected functions and missing Gmail/Resend functions only after
  their storage prerequisites and runtime secret names are verified; certify OAuth,
  signed delivery events, cron and retries using controlled test data.

These phases are not certified complete by the source fixes alone. A successful
frontend deployment does not deploy Supabase functions or reconcile database state.

## Production checkpoint, 2026-11-23

The dashboard deployed admin-credential-manager, payments-initiate, payments-status
and payments-configure using an entrypoint importing the immutable GitHub source at
`09dfe4cc437671365f88d51b3e973358f518f83e`. Supabase resolves and bundles that source
during deployment; this keeps the deployed business logic tied to a reviewed commit.

Live certification after deployment: 15 checks passed and 3 failed. All four repaired
functions now pass official-origin preflight and untrusted-origin isolation. Admin
OPTIONS returns 204 instead of 500. Invalid payment initiation returns the expected
PAYMENT_REQUEST_INVALID response without initiating a payment. Gmail preflight still
returns 404 (two checks); Resend webhook presence still returns 404 (one check).

GitHub verification for both source commits passed. Production database history,
backups, provider credentials and storage prerequisites remain uncertified. MCP
still denies access to the BarberOS project on all available account links. An
attempt to manage the connection through the desktop UI was denied by the computer
use tool. Account reconnection must be completed by the user before API-based schema
reconciliation can proceed. No production schema or migration history was changed.
