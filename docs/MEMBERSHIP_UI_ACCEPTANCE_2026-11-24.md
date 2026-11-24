# Team access contract and browser acceptance

## Decision

Restoring direct DELETE on barbershop_members would bypass the reviewed lifecycle
and last-owner protections. Calling the removal RPC inline would fix the immediate
failure but leave unchecked responses and duplicated transport rules. The selected
members feature API uses the existing owner-only list/add/remove RPCs, generated
argument types and Zod validation of incoming rows and mutation identities.
No grants are reopened and no new membership policy is invented.

The UI now removes through remove_barbershop_member with both tenant and membership
identifiers. The backend already serializes owner changes with the shared tenant
advisory lock; the isolated two-session races and cloud synthetic boundary tests
are recorded separately. Browser tests do not claim to prove SQL authorization.

## Behavior

Only the owner mounts the access editor. The owner-only directory hook is no
longer requested from the manager's barber configuration; the linked account is
preserved when editing and its owner-only picker is hidden for managers.

Fields validate and focus the invalid email. The submitted tenant/email/role are
captured as immutable mutation input. A pending mutation blocks repeat submits.
Failures preserve input and explain domain conflicts, including LAST_OWNER,
USER_NOT_FOUND, MEMBER_SELF_REMOVE and FORBIDDEN. Successful operations refresh
both the tenant directory and current memberships.

Removal uses the canonical AlertDialog with Cancel initially focused. Cancel and
Escape make no request. Closing is blocked while the request is pending; errors
remain inside the open dialog and allow deliberate retry. After successful removal
focus goes to a surviving control. Switching tenant/account remounts the form,
closes the old dialog and prevents a late response from clearing the new draft or
showing an unrelated success toast. A successful add focuses the email only after
the pending state reenables it; the browser suite caught and verified this repair.

Null email/name values remain explicit instead of inventing account data. Invalid
directory responses show a retry state rather than rendering partial access data.

## Evidence and limits

Eighteen Chromium scenarios passed across desktop and Pixel 7 viewports, using the
actual editor, canonical controls, query hooks and Supabase HTTP client. Only auth/
tenant context and external HTTP responses are controlled. Assertions cover exact
RPC payloads, retry, keyboard/focus, duplicate prevention, stale tenant responses,
manager denial, nullable fields, runtime response validation and no page errors.
List and confirmation have no serious/critical axe findings or viewport overflow.
Both viewport screenshots were inspected. Typecheck, lint, frontend suite and
production build pass. Tests are wired into frontend CI.

The first broad frontend-suite invocation lacked its required fixture environment;
it was rerun with explicit non-production Supabase settings and passed. A concurrent
Vite fixture run had a blank initial load; the team browser fixture now has its own
dependency cache and the final full run passed. This is not provider certification.

The global premium audit still reports 61 findings; none is attributed to the new
editor/API. Existing barber CRUD dialogs and the order-queue member-assignment
contract remain separate work. A fixture is not a real-device or live membership
mutation receipt; production acceptance must still check the deployed browser.

## Deployed read acceptance

Commit 8c138e0a524a2e6904c84631d7c47c726295a966 passed all seven triggered
GitHub workflows. The actual owner browser displayed the new labelled membership
form and its real directory with no error state. It initially served the older
service-worker shell; after the new worker activated, reload served
index-BSszT-EQ.js and the new contract was confirmed. This read acceptance did not
remove a real staff member or test an external provider.

The subsequent controlled production mutation also passed: cancel, scoped removal,
audit cardinality, persistence after reload, guarded fixture cleanup and original
tenant restoration. See LIVE_TEAM_MUTATION_ACCEPTANCE_2026-11-24.md. It used an
isolated suspended QA tenant and a synthetic member, with no real staff removed.
