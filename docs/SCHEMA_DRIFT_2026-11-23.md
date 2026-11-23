# Live schema reconciliation checkpoint

Captured read-only from production `alseiinjzwjdiwtvkdzy` and staging
`asikuyxaapcmayptimxi` on 2026-11-23 with `scripts/schema-manifest.sql`.
The query returns structure and definition hashes, not customer rows or secrets.

| Inventory | Production | Staging |
| --- | ---: | ---: |
| Public/private tables | 38 | 37 |
| Columns | 420 | 411 |
| Application functions | 158 | 134 |
| Policies | 52 | 57 |
| Triggers | 72 | 52 |
| Indexes | 178 | 182 |

Production-only tables: gmail_connections, gmail_oauth_states,
platform_access_events, support_tickets. Staging-only tables: platform_settings,
shop_operation_incidents, shop_operation_incident_events. Staging also lacks
appointments.manage_token_expires_at, profiles.password_change_required and
services.photo_url. Production lacks staging's delivered_at/bounced_at columns
on notifications. These are real differences, not timestamp aliases.

Staging lacks production's dashboard, appointment read model, reports, platform
administration, password-change guards and member-removal functions. Production
lacks staging's operation-incident functions. Definition and privilege differences
also exist among shared functions; inventory counts alone do not certify parity.

The refreshed migration-history audit has zero unresolved remote records and 43
unresolved local sources. A strict release remains blocked. Four source mappings
were accepted only after comparing complete source SQL with recorded statements.

## Reproduce

Run schema-manifest.sql unchanged on each database, save the schema_manifest JSON
field, then compare:

```sh
node scripts/compare-schema-manifests.mjs expected.json actual.json
```

Drift exits nonzero. `--report-only` prints the same differences without failing;
it does not change the result to SCHEMA_MATCH. Missing categories and duplicate
object identities are rejected. This is an exact structural comparison and does
not claim semantic equivalence of differing SQL definitions.

Before any production roll-forward, reproduce the full source migration chain in
the isolated local stack, inventory its resulting schema, establish restore
evidence, and review each remaining source against the actual live definitions.
No production schema or migration history was modified at this checkpoint.
