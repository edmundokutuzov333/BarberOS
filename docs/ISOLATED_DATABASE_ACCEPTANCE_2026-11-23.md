# Isolated database acceptance — 2026-11-23

## Execution evidence

- Host runtime: Docker 29.9.3 on Colima 0.10.3, ARM64 VM, 2 CPUs and 4 GiB RAM.
- VM files reside on an APFS sparse bundle on the ADATA SC740 external SSD.
  The host's original Colima path is a symlink to the mounted runtime volume.
- Supabase CLI: 2.81.3 through npm, pinned explicitly. Homebrew's CLI build was
  unavailable because it required a newer Xcode; the npm distribution worked.
- Full source chain: all 148 migrations applied successfully.
- `supabase db reset --local --no-seed` finished successfully.
- pgTAP: platform_access_security.test.sql, platform_core_contracts.test.sql and
  resend_webhook_contract.test.sql passed: 3 files, 61 assertions.
- Manifest captured using scripts/schema-manifest.sql: 48 public/private tables,
  520 columns, 164 application functions, 56 policies, 53 triggers, 222 indexes,
  296 constraints, 81 enum labels and 382 table privilege entries.

No M-Pesa/E-Mola provider requests or transaction tests were performed. This
checkpoint certifies local migration replay and the listed SQL security contracts;
it does not certify payment integration or all domain lifecycle tests.

## Runtime limitations still open

The first full-stack startup completed all migrations but failed the Storage
container health check. Supabase then stopped that local stack. A subsequent
database-only startup and reset succeeded. Storage/API/browser lifecycle
certification remains outstanding and must be exercised separately.

The production schema differs from this source replay: 11 tables, 103 columns,
9 functions and 84 table privilege entries present in source are absent remotely.
There are also changed definitions and production-only security guards. These
differences must be reviewed individually; replaying old source migrations over
production could overwrite later production hardening.

## CI regression fixed

GitHub run 45172621966 passed frontend/contracts but failed before migrations
because host port 54322 was already in use. CI now allocates available API, DB,
shadow and Studio ports, assigns a per-run project identity and targets the exact
database container. It also pins the CLI and uses the current mailpit exclusion.
Run 45173495024 subsequently passed all jobs.

## Provider configuration evidence

The deployed health function returns configuration_presence booleans only.
On 2026-11-23 all five groups reported false: gmail_oauth, resend_delivery,
resend_webhook, google_calendar and whatsapp. Presence does not validate
credentials, OAuth consent, DNS, message delivery or webhook authentication.
No secret values, sender addresses or tokens are included in this health result.

Production health remained HTTP 200 with a successful database roundtrip.
External service readiness remains a separate release gate.
