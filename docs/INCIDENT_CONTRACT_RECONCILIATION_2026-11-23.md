# Incident contract reconciliation

The production-generated database types were compared with the committed types.
Production lacks `create_shop_operation_incident`, `list_shop_operation_incidents`
and `update_shop_operation_incident`, although LojaRelatorios invokes all three.
The current UI therefore encounters a missing-RPC error for incident operations.

Disabling the UI would remove a required operational capability. Replaying the
historical migration would fail in staging and in a fresh source installation,
where the tables already exist. The selected repair is an incremental migration
that preserves the reviewed incident domain and makes table, index and policy
creation repeatable. It does not enable a tenant's shop feature flag.

## Validation before production

- Applied twice to the isolated local database with `ON_ERROR_STOP=1`.
- Executed `supabase/tests/shop_phase8_incidents.sql`; passed with rollback.
- Applied through the staging migration API, then executed the same transactional
  lifecycle and tenant-boundary acceptance test; no SQL errors, fixtures rolled back.
- Production prerequisite query confirms both incident tables are absent, the
  composite order/tenant unique key exists and both authorization helpers exist.
- Captured all 37 public production tables in one repeatable-read, read-only
  transaction before the change. Encrypted artifact is outside Git on the external
  SSD, with a separate recovery key restricted to mode 0600. AES-GCM decryption
  roundtrip verified; plaintext SHA-256:
  `3d6ada3db035de9e803b5d0845ad5f3659b110e1df585d506e98fb36fcf72db2`.

The public-table capture does not include Auth, Storage objects or private rate
limits and is not a complete disaster-recovery certification. No historical
notification was retried and no payment-provider integration was tested.

## CI follow-up

Isolating database ports exposed another independent failure: the HTTP concurrency
job installed Playwright 1.56.1, which does not support the current Ubuntu runner.
It now installs the repository's frozen Yarn lockfile, using the same Playwright
version as the other browser jobs. A remote rerun is required before certification.

## Production acceptance and generated contracts

Migration applied in staging as `20261123124407` and production as
`20261123124859`. The transactional incident acceptance file passed in production
and rolled its fixtures back. The source commit `0d71431` passed all five triggered
workflows: primary verification, Phase 23 acceptance, Phase 24 concurrency,
Phase 26 deployment contracts and the Vercel production deployment. The HTTP
concurrency job now executes successfully with the locked browser tooling.

Database types were regenerated through the production API after this migration.
`frontend/src/lib/database.generated.ts` is the unmodified generated artifact.
`database.types.ts` retains a narrow, key-checked nullability contract because the
Postgres catalog does not encode nullable SQL arguments. This preserves explicit
null for optional filters, barber selection and clearing optional fields, while
shop IDs and required service IDs remain non-null. Compile-time assertions check
these boundaries without changing the generated table or response types.

Typechecking, lint, the complete frontend unit/component/contract command and the
production build passed locally with the public environment variables supplied.
The first local contract invocation stopped at the expected missing-environment
guard; rerunning with the required public configuration passed.

The migration snapshot now records 145 production and 120 staging entries. The
audit still blocks release with 43 unresolved sources, including the newly exposed
production partial-delivery notification migration. This is not a release approval.
