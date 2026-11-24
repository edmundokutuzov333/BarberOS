# Final historical-source review and forward plan

> Superseding rollout result: the reviewed migration is now deployed in staging
> and production; all nine cloud boundary suites passed and the strict history
> mapping gate is clear. See [rollout acceptance](AUTHORIZATION_ROLLOUT_ACCEPTANCE_2026-11-24.md).
> Pending statements below describe the pre-promotion checkpoint, not current
> deployment status. This does not certify all phase exit criteria.

Every captured remote migration now has a source/archive disposition. The nine
remaining staging sources have also been fully reviewed and mapped to complete,
fingerprinted forward SQL components. The history review is complete; their
deployment is not. The auditor reports `history_review_complete: true` and
`NO_GO_PENDING_FORWARD_RECONCILIATION`, with nine pending dispositions. Its strict
release mode still fails. No remote history record is erased, renamed or repaired
merely to change that result.

This distinction ends the freeze on *authoring* a new incremental reconciliation
migration. It does not authorize a release certification from source review alone.
Each pending disposition can be closed only after the versioned migration is
applied and its actual behavior tested in the intended cloud environment.

## Architectural decision

Replaying the older sources verbatim would reopen raw token functions through
anonymous grants, restore blanket authenticated function access and overwrite
shop-owned catalogues, prices, identities and schedules. Copying the entire
production database would import unrelated data and still preserve defects.
The selected solution is a scoped forward migration built from reviewed current
contracts plus explicit repairs. It preserves later gateway lockdowns and existing
tenant data, and uses authoritative profile state rather than UI-only redirects.

| Historical source intent | Forward component | Evidence before cloud deployment |
| --- | --- | --- |
| Three public review/return fixes | application_contracts, review_notifications | Boolean has_review state, immutable submission replay, rating/audit synchronization, one enabled email review request. |
| Phase 22 policies and permissions | application_contracts, password_rotation_boundaries, tenant_membership_boundaries | Scoped RLS/grants, owner/barber/tenant tests, account denial and real two-session membership races. |
| Operator-only notification metrics | application_contracts | Existing operator boundary retained; direct notification table access removed. |
| Appointment read model | application_contracts | Reviewed tenant-qualified joins, date range and role restrictions. |
| Service photo schema/public payload | application_contracts | Add nullable photo column and actual public payload field; none of the fictional seed writes are retained. |
| Rotation enforcement/profile flag fixes | password_rotation_boundaries | Private helper denial, missing-profile denial, own safe profile fields, protected flags and guarded shop creation/replay. |

The snapshot records each original source SHA-256 and every associated candidate
SHA-256. Missing/tampered source or candidate bytes invalidate review. A pending
review never turns the release gate green.

## New defects reproduced and repaired in the candidate

- Production's add-member RPC allows the last owner to demote themselves. The
  synthetic rollback test fails with `LAST_OWNER_DEMOTION_ALLOWED` before repair.
- The frontend removes members by direct DELETE although production revoked that
  table privilege. It must use the owner-only removal RPC after backend promotion.
- Target-row locks cannot protect two owners removing each other. Both mutations
  now share a tenant advisory transaction lock and recheck the actor afterwards.
  Repeated identical adds/removals do not duplicate records/audit events.
- Shop creation had no existing membership boundary and could bypass mandatory
  rotation. It now checks authoritative account state explicitly. Identical owner
  retries return the same shop without duplicate hours/membership/audit.
- Cloud production had revoked profile UPDATE completely. The candidate grants
  only full_name/phone/avatar_url updates; privileged flags remain server-only.
- Old completion triggers requested only WhatsApp despite the email-first policy.
  New completions select a configured real destination, enqueue one request and
  record a skipped-reason audit when no enabled recipient exists. No historical
  customer email is replayed.

## Actual isolated acceptance

All four components apply twice to the independently restored no-network target
`barberos_restore_package_20261124`. Nine synthetic behavior suites and all 71
existing pgTAP assertions pass there. The two independent-session races leave one
owner in both removal and demotion cases, with exactly one successful mutation
and one audit event. Fixture cleanup runs in finally; no cloud race was executed.
The restored target is now a reconciliation QA database, so its live schema no
longer equals the earlier immutable pre-change restoration receipt.

The pinned Supabase CLI generated migration
`20261124044009_reconcile_application_authorization.sql` after the history-review
gate passed. Its SHA-256 is
`84067a707a8f7bb3ad6035f85ba309ce71a6ebce4623256e88a713a3ff5cc25f`.
`bundle.json` binds all four components; the verifier rejects changed component
bytes or a migration that differs from the reviewed composition.

CI resets the complete versioned chain, reapplies that exact migration for
idempotence, then runs behavior and two-session tests. It no longer patches the
database with separate unshipped candidates. Repository validation does not prove
cloud deployment. SQL rollout, the membership UI correction and actual
staging/browser acceptance remain required.

## Staging rollout and regression correction

The versioned migration was applied in staging and all nine synthetic boundary
suites passed there. Production rollout remains pending. The primary CI reset,
security and concurrency job passed; the auxiliary Phase 23 suite exposed an old
test that inspected audit_logs while still using the owner role. Production's
existing policy already denies that direct access. Its persistence assertion now
uses the fixture inspector after the authenticated CRM actions, preserving the
browser denial. All 30 non-provider legacy suites then pass against the isolated
restored database with this exact versioned migration. Provider-domain suites are
explicitly deferred, not counted as passed.

The no-network restore target was actually restored from the encrypted archive
after candidate testing. Schema equality, all 70 rowsets and three local Vault
records passed again, before reapplying the versioned migration for legacy
acceptance. This verifies a local rollback/recovery procedure, not cloud DR.
