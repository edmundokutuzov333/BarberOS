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

The final history review is complete and the reviewed components are now compiled
into CLI-generated migration `20261124044009_reconcile_application_authorization.sql`.
CI resets and tests that versioned chain, rather than patching it with a separate
candidate. The cloud migration has not yet been applied; production SQL exposure
remains an open release blocker. The exact source/component hashes and pending
cloud dispositions are recorded in `FINAL_HISTORY_FORWARD_PLAN_2026-11-24.md`.

Further review found that shop creation did not call a membership helper at all;
it now explicitly checks authoritative account state, including missing profiles,
and returns the same shop on an identical owner's retry. Profile editing uses
column-specific grants for full_name/phone/avatar_url, preserving server-only
control of rotation/admin flags. These additional cases pass in the independently
restored isolated database.

HTTP deployment from `315a735d013e412d263bda9bdd97d593640443a8` is verified:
Gmail production v8/staging v4 share bundle
`72335aaba8998203450c9dfbb4bd28e3989ff403fd6af400d10b8c891a75d244`;
credential management production v9 has bundle
`d95ad9aac719dbb12191efccd5bde4e7788f84c3e4a2cb4ba0935eccd2768c3c`.
With the authorized owner's rotation flag temporarily enabled, actual signed-in
requests to both functions returned 403 `PASSWORD_CHANGE_REQUIRED`. A controlled
OAuth callback returned 302 to the official application with reason
`password_change_required`, before code exchange. The original flag was restored
to false in a finally block and the controlled OAuth state removed. No password
was submitted or changed. Baseline Gmail status succeeds; this regular owner is
correctly denied platform-admin operations.

The published Gmail UI hides inbox/thread data and shows its recovery link under
the same temporary flag. Following that link exposed another real defect: the
recovery route was outside PrivateProviders and thus never obtained AuthContext.
It displayed `A verificar a conta…` indefinitely although a direct profile request
returned 200 with the authoritative flag. The route now supplies its own
AuthProvider, without tenant queries. Public-page provider promotion and moving
recovery under the entire tenant layout were rejected because they respectively
increase public bootstrap work and couple account recovery to shop availability.
Real-router browser regressions cover entry, missing session, both completion
paths, backend failure/retry and validation: all 12 desktop/mobile cases pass.
All six workflows for `276ed9d935e5880bd229503007ccc86f8558203c` passed. On the
published application (entry `index--SBxEw-i.js`), the actual Gmail recovery link
now opens `/alterar-palavra-passe`, renders both password inputs and removes the
pending account message. The same controlled flag was restored to false in a
finally block; no password was entered/submitted. The old service worker initially
served the previous bundle; its update was confirmed before this acceptance.
