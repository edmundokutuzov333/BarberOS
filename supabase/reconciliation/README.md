# Reviewed reconciliation candidates

Files here are complete SQL candidates tested in disposable databases. They are
intentionally outside `supabase/migrations` while historical-source reconciliation
is frozen. A passing candidate test does not mean that production runs it.

`password_rotation_boundaries.sql` closes a reproduced authorization bypass in the
private membership/admin helpers, retains the policy helpers' existing browser
EXECUTE requirement, makes compatibility wrappers agree, and fixes profile UPDATE
validation without calling a browser-inaccessible public helper. It rejects a
missing authoritative profile for an authenticated identity.

Before deployment, finish the historical-source dispositions, generate an incremental
migration using the pinned Supabase CLI, preserve the already captured production
function fingerprints/grants, apply in staging, run the transaction-scoped behavior
suite and baseline domain/security tests, then deploy with a recorded rollback.
The companion HTTP changes in Gmail/admin credential handling enforce the same
account flag without waiting for a new SQL migration; they are separately versioned
and require their own runtime deployment receipt.
