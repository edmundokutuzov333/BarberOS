# Password-rotation authorization reconciliation

## Reproduced defect

A public wrapper in the fresh migration chain checks the rotation flag, but the
private helpers do not. Operational
SECURITY DEFINER RPCs use those private helpers. A transaction-scoped owner with
password_change_required=true successfully calls the dashboard despite the UI
redirect. The regression test fails before correction with
`FORCED_OWNER_DASHBOARD_ALLOWED`; the synthetic identities disappear on rollback.
Captured production helper definitions show the same missing gate. No real user's
password was changed to reproduce this behavior. The live production count showed
zero accounts (and zero administrators) currently awaiting rotation; that does
not remove the defect in future reset flows.

## Selected architecture

Three approaches were assessed: add more UI redirects, patch individual RPCs, or
make the shared SQL and HTTP authorization boundaries authoritative. UI redirects
cannot protect direct requests; individual patches leave alternate paths. The
shared-boundary design is selected.

The complete SQL candidate guards private membership, platform administration,
agenda/admin entry points and compatibility wrappers using the stored profile
flag. It preserves helper execution required by RLS. Profile updates keep both
protected flags immutable without calling an inaccessible public wrapper. Missing
profiles fail closed. The candidate applies repeatedly without data mutation and
passes in both the initial and separately restored local databases.

The real behavior test covers blocked owner/admin RPCs, user_metadata spoofing,
self-clearing the flag, normal owner/admin recovery after the flag clears, legitimate
profile edits, self-promotion denial and missing profile denial. All 71 existing
security/storage pgTAP assertions also pass after the candidate.

Gmail and credential management share a runtime-validated HTTP account-state
policy. Eight Deno cases cover active/blocked/admin/missing/malformed/database-error
states and the explicit own-password-completion exception. Gmail rechecks account
and tenant authorization before and after provider round trips in the OAuth
callback. Its UI hides mail after a rotation denial and offers an actual link to
the existing password-change page; full navigation refreshes the profile state.
Eighteen desktop/mobile browser scenarios pass, including that recovery state.

## Deployment state

The SQL remains outside the migration chain under `supabase/reconciliation` while
historical-source reconciliation is frozen. CI clearly labels and tests this
candidate separately from resetting the published chain. It has not been applied
to either cloud database; the production SQL exposure is still an open release
blocker. The HTTP code is independently deployable against production's existing
flag column; its deployment and live denial/healthy-account acceptance must be
recorded before claiming that boundary complete.
