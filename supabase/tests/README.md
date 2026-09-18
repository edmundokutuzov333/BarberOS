# Supabase Database Tests

Tests under this directory are database-level acceptance checks.

They should be:
- deterministic
- explicit about whether they mutate data
- safe to run against the intended environment
- independent from UI timing

Phase 2 baseline test:

`migration_phase2.sql`

This file is read-only and validates the current migration/schema contract.
