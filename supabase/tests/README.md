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


### Phase 8

`booking_wizard_phase8.sql` valida o percurso backend usado pelo wizard público: dia realmente disponível, slot realmente disponível, resolução de "qualquer barbeiro", criação online com token, customer upsert, notification/audit queue, overlap protection e grants públicos sem INSERT directo em `appointments`. Os fixtures do teste são rollback-only.
