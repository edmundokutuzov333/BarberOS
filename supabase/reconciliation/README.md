# Reviewed reconciliation candidates

Files here are reviewed SQL components tested in disposable databases. A passing
isolated test does not mean that production runs them.

The final source review is now complete. Four fingerprinted components have been
compiled into CLI-generated migration
`20261124044009_reconcile_application_authorization.sql`. `bundle.json` and
`scripts/verify-reconciliation-bundle.mjs` enforce exact correspondence. The files
remain here as reviewed provenance, not a second deployment path. Do not edit a
component or a published migration to silently patch CI; use a new reviewed
incremental migration for subsequent changes. Cloud deployment is still pending.

`password_rotation_boundaries.sql` closes a reproduced authorization bypass in the
private membership/admin helpers, retains the policy helpers' existing browser
EXECUTE requirement, makes compatibility wrappers agree, and fixes profile UPDATE
validation without calling a browser-inaccessible public helper. It rejects a
missing authoritative profile for an authenticated identity.

For deployment, preserve the captured production function fingerprints/grants,
apply the exact versioned migration in staging, run the transaction-scoped behavior
suite and baseline domain/security tests, then deploy with a recorded rollback.
The companion HTTP changes in Gmail/admin credential handling enforce the same
account flag without waiting for a new SQL migration; they are separately versioned
and require their own runtime deployment receipt.
