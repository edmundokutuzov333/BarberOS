# Application authorization rollout acceptance

The published migration `20261124044009_reconcile_application_authorization.sql`
was applied unchanged through Supabase Management in staging (server version
`20261124044806`) and production (`20261124050130`). Source SHA-256:
`84067a707a8f7bb3ad6035f85ba309ce71a6ebce4623256e88a713a3ff5cc25f`.
No remote migration history was deleted, renamed or repaired.

Production promotion followed successful runs on commit
`07b3a0b86f2767cf26e39e5f5139baba4f6c91fc`: primary CI 45329819797,
frontend 45329819888, Phase 23 45329819807, Phase 26 45329819914 and
Vercel deployment workflow 45329819706. Thirty non-provider legacy SQL
suites passed; the two provider-domain suites remain explicitly deferred.

All nine transactional suites passed independently in both cloud databases:
password_rotation_boundary, membership_boundary, reporting_boundary,
shop_partial_delivery_boundary, booking_gateway_foundation,
platform_admin_boundary, tenant_immutability_boundary,
notification_channel_boundary and review_public_contract_boundary.
Their fixtures are synthetic and rolled back. No customer password was changed.
Two independent-session membership races also passed in the isolated target.

After promotion, the actual signed-in production browser called the dashboard
RPC successfully (HTTP 200, 636 ms) and performed a restricted real Gmail search
for controlled BarberOS mail (HTTP 200, 1085 ms, two threads). Mail contents,
tokens and credentials are excluded from this record. These are observations,
not a latency SLO or comprehensive UI certification.

Fresh history capture contains 148 production and 136 staging records. The nine
previous staging forward dispositions now have deployed evidence. The strict
history auditor reports HISTORY_NAME_MAPPING_COMPLETE, zero unresolved records
and zero pending forward dispositions. Static frontend inventories now find no
missing RPCs or tables in staging; five Edge Functions are still missing there.

Before rollout, encrypted schema/function metadata was captured for both clouds
and authenticated decryption verified. The isolated full backup was actually
restored again: schema, all 70 table rowsets and three Vault records matched.
That proves the local restore procedure; cloud Auth/Storage/data disaster recovery
has not been certified. Metadata-only cloud captures are not data backups.

## Remaining gates

History-name closure does not establish complete schema equivalence or production
readiness. Retired prototype objects remain in the fresh local chain; selected
staging legacy overloads/triggers still require semantic review. Membership UI
removal still needs its RPC correction. The static inventory does not validate
every payload, return value or permission. Staging integrations, Calendar, Google
public OAuth verification and full end-to-end certification remain open.

Security advisors still require review; no finding is waived merely because the
migration passed. Payment-provider calls and tests remain deferred by instruction.
