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
