# BarberOS migration audit archive

These SQL files preserve statement bodies read from the remote `supabase_migrations.schema_migrations` table on 26 October 2026. They are audit evidence only and are stored under `docs/`, outside the executable migrations directory. Do not replay these archived statements.

Projects:
- Production: `alseiinjzwjdiwtvkdzy`
- Staging: `asikuyxaapcmayptimxi`

Production entries: 6 unmatched history records.
Staging entries: 6 environment-specific or divergent history records.

The archive preserves the exact text and MD5/length values from the remote statement arrays. Names and version timestamps are not by themselves proof of schema equivalence. Exact-content aliases and reviewed divergences are documented in `docs/BARBEROS_MIGRATION_RECONCILIATION_2026-10-26.md`.

The staging Resend webhook statement differs from the local file by an idempotent table-creation clause and remains a divergence requiring live-object comparison. Staging `reconcile_shop_*` entries are environment-specific and must not be replayed into production.

Production schema and migration history were not changed by this archive.
