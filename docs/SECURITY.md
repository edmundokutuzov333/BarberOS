# BarberOS Security Hardening

## Fase 1

Runtime secrets were removed from the current repository tree.

Browser configuration now prefers a Supabase publishable key. Legacy VITE_SUPABASE_ANON_KEY remains only as a compatibility fallback so an existing deployment does not fail before its environment variable is migrated.

Server-side code does not read repository .env files. It requires process environment variables.

Sensitive operational tables no longer accept direct client DML for appointments, payments, notifications, reviews, waitlist entries, or audit logs. Their state transitions must be implemented through controlled database functions or server-side boundaries.

RLS helper functions used by the policy layer were moved behind the private schema with pinned search_path.

Tenant ownership is immutable on update for all domain tables carrying barbershop_id.

New public-schema functions have default execution revoked from public roles. Application RPC execution is granted explicitly.

The raw SQL helper, admin provisioning script, and mutating booking test are now fail-closed and require explicit environment variables and safety flags.

## Current security acceptance

Passed:
- no .env files remain in the current main tree
- no Python bytecode or .DS_Store generated files remain in the current main tree
- anonymous direct INSERT on appointments is disabled
- authenticated direct INSERT on appointments is disabled
- anonymous direct UPDATE on payments is disabled
- authenticated direct UPDATE on payments is disabled
- authenticated direct INSERT on reviews is disabled
- authenticated direct DELETE on waitlist_entries is disabled
- authenticated direct UPDATE on notifications is disabled
- anonymous booking/availability RPC execution remains enabled
- authenticated onboarding/member/catalogue RPC execution remains enabled
- tenant move guard raises TENANT_IMMUTABLE and was verified inside a rolled-back transaction
- migration security_hardening is registered in Supabase

Intentional remaining advisor findings:
- public booking and availability RPCs are SECURITY DEFINER because anonymous customers must be able to use them
- authenticated shop/member/catalogue RPCs are SECURITY DEFINER because they perform privileged domain operations
- btree_gist remains in public for the existing appointment exclusion constraint
- performance advisor findings remain for the later performance/hardening phase

## Credential incident status

A legacy Supabase service_role credential and a platform test-account password were present in repository history before this hardening work.

The current repository tree no longer contains those secret-bearing files, but deleting current files does not erase historical Git objects.

The legacy service credential must be retired after every server consumer is migrated to a newly issued Supabase secret key.

The platform test-account password must be rotated in Supabase Auth.

Historical secret removal from Git history is also required for a complete incident response. The available GitHub connector can remove current files but does not provide a safe history-rewrite operation in this execution environment.

The available Supabase connector does not expose Dashboard API-key rotation/deactivation or the Auth leaked-password-protection control. Those control-plane actions remain external to this execution environment.

## Environment contract

Production and development environments must provide secrets through deployment configuration, not Git:
- browser: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
- server: SUPABASE_URL + SUPABASE_SECRET_KEY
- database tooling: DATABASE_URL
- tests: BARBEROS_TEST_*

Never commit real values to .env, .env.local, CI YAML, source code, fixtures, or documentation.

## Operational rule

Production database changes go through Supabase migrations.

Mutating QA scripts require an isolated test database and an explicit safety flag.

Never use a production database as a mutable test environment.

## References

Supabase recommends publishable keys for browser clients and secret keys for server-side use, and recommends disabling compromised legacy keys after consumers migrate.

Supabase recommends pinning the search_path for SECURITY DEFINER functions and managing function execution privileges explicitly.