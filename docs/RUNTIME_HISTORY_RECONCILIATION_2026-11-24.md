# Runtime and historical migration reconciliation

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

Production has 39 public tables and staging 38; every one has RLS enabled. The
fresh local chain has 47 public tables. Production has platform access events
and support tickets absent from staging; staging has platform settings absent
from production. Eight prototype-foundation tables in the source chain are absent
from production. Counts do not establish schema parity, and RLS presence alone does
not establish correct authorization. These differences still need explicit intent,
contract tests and reviewed forward migrations.

The current history auditor reports 38 unresolved source dispositions (six in
production and 32 in staging), zero unmapped remote migration records. A source
mapping is not permission to replay older SQL: later tenant hardening, notification
semantics and data already owned by shops must be preserved.

## Current security advisors

Both databases still report `btree_gist` in public and leaked-password protection
disabled. Production has seven anonymous and 79 authenticated SECURITY DEFINER
exposure advisories; staging has seven and 56. Each callable contract needs its
own authorization review rather than revoking all legitimate application RPCs.
The seven/ six no-policy RLS informational findings include intentionally private
service-only tables; the live Gmail REST denial independently confirms its boundary.

Advisor references: [extension location](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
[anonymous definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No advisor was dismissed merely to obtain a green dashboard. Full phase completion
and launch approval remain unproven while the above gates are open.
