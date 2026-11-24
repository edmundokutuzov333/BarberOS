# Runtime and historical migration reconciliation

> Superseding rollout result: the reviewed migration is now deployed in staging
> and production; all nine cloud boundary suites passed and the strict history
> mapping gate is clear. See [rollout acceptance](AUTHORIZATION_ROLLOUT_ACCEPTANCE_2026-11-24.md).
> Pending statements below describe the pre-promotion checkpoint, not current
> deployment status. This does not certify all phase exit criteria.

## Evidence and decisions

The strict history gate remains NO-GO. Five source dispositions were resolved by
comparing the actual contracts, not by changing remote migration history:

- Production's strict phone-regex source was superseded by archived migration
  `20260918153729_manual_booking_phone_structural.sql`. A complete-file diff changes
  only the first comment and the equivalent phone predicate. Sixteen accepted and
  rejected phone boundaries pass against local, staging and production functions.
  The read-only test uses an absent tenant and rolls back; it creates no booking.
- Both environments implement the idempotent booking/payment privilege source.
  The nine-argument booking RPC MD5 `03f78b2316997ade89d50c0fa5f47897` matches the
  fresh migration-chain database. Catalog grants deny both browser roles and allow
  service_role for the affected booking/payment entries.
- Both environments implement token gateway privilege lockdown. The catalog-only
  test covers all token RPCs and explicit waitlist/payment entries. No payment
  integration or provider request is executed by this test.

Permanent SQL tests are `booking_phone_boundary_audit.sql` and
`token_gateway_privilege_audit.sql`; both pass in all three databases and are now
part of the primary CI database job. These are contract dispositions, not a claim
that every later function body is identical across environments. In particular,
some staging token-management bodies still differ from production.

## Current schema scope

Production and staging now each have the same 40 public table names; every one
has RLS enabled. The fresh local chain has 47 public tables. Platform access events
and support tickets have been installed in staging; platform settings have been
installed in production. Eight prototype-foundation tables in the source chain are absent
from production. Counts do not establish schema parity, and RLS presence alone does
not establish correct authorization. These differences still need explicit intent,
contract tests and reviewed forward migrations.

The current history auditor reports zero unreviewed sources and zero unmapped
remote records. Nine reviewed staging forward dispositions still await cloud
deployment, keeping status `NO_GO_PENDING_FORWARD_RECONCILIATION`. Their exact
source/candidate hashes and intent are in `FINAL_HISTORY_FORWARD_PLAN_2026-11-24.md`.
Eight
unsafe demo/unwired prototype dispositions are deliberately retired with exact
source hashes; see `LEGACY_SOURCE_DISPOSITIONS_2026-11-24.md`. A source
mapping is not permission to replay older SQL: later tenant hardening, notification
semantics and data already owned by shops must be preserved.

## Staging prerequisites applied on 2026-11-24

After the encrypted public-table capture
`staging-20261124-before-profile-flag.encrypted.json` (plaintext package SHA-256
`9f6038093d3a84f58e388c086ceaab388e5bcd8abf2d15f9d3004348f71eac5b`),
two existing source migrations were applied unchanged:

| Source | Actual server version | Name |
| --- | --- | --- |
| `20261020062902_force_password_change.sql` | `20261123234032` | `force_password_change` |
| `20261020062637_platform_access_audit.sql` | `20261123234200` | `platform_access_audit` |

The live history contains 122 staging records. The new flag is non-null/default
false with zero accounts awaiting rotation; the audit table has RLS and denies
browser SELECT. These prerequisites do not install the pending SQL authorization
candidate, reporting RPCs or the administrative Edge Function.

Subsequently, the five existing reports sources were applied unchanged at server
versions `20261124000710`, `20261124000714`, `20261124000717`, `20261124000721`
and `20261124000724`. The existing management-token expiry repair was applied at
`20261124000750`. Staging now has 128 history records. No existing token was
replaced; there were zero staging appointments to backfill.

Production's existing partial-delivery notification source was applied at server
version `20261124001017`, bringing its history to 146 records. The exact before
definition/constraints/grants were captured. The change adds the missing partial
event to the check and emitter, preserving every other transition and tenant key.
See `REPORTING_AND_PARTIAL_DELIVERY_ACCEPTANCE_2026-11-24.md` for runtime evidence
and rollback limits. None of these operations rewrites remote history.

## Current security advisors

Fresh advisors after the prerequisite rollouts still report `btree_gist` in public
and leaked-password protection disabled in both databases. Production has seven
anonymous and 79 authenticated SECURITY DEFINER exposure findings; staging has
seven and 76. Each callable contract needs its
own authorization review rather than revoking all legitimate application RPCs.
The eight no-policy RLS informational findings in each environment include intentionally private
service-only tables; the live Gmail REST denial independently confirms its boundary.

Advisor references: [extension location](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
[anonymous definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No advisor was dismissed merely to obtain a green dashboard. Full phase completion
and launch approval remain unproven while the above gates are open.
