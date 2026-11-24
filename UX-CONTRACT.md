# BarberOS interaction contract

This records shared UI ownership and the repaired Gmail workflow. Business policy
remains in the referenced contracts; this file does not grant permissions or change
billing, retention, or tenant lifecycle rules.

| Business context | Source | UI consequence |
|---|---|---|
| Tenant management access | `docs/PERMISSIONS.md`, Gmail `shopAccess` | Only owners/managers may connect or operate Gmail; backend checks every action. |
| OAuth and private tokens | `docs/GMAIL_INTEGRATION.md`, Gmail storage migrations | Show connection status; never expose tokens in UI/logs. |
| Disconnect lifecycle | Gmail disconnect server action | Explicit confirmation, revocation and removal of the local connection; emails stay in Gmail. |
| Provider failure | Gmail domain error contract | Preserve draft and connection dialog, explain failure, allow explicit retry. |
| Billing and legal content | Existing payment/terms/privacy sources | This Gmail repair introduces no billing or legal-policy change. |

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | Page, Panel and conversation state | `frontend/src/components/layout/Page.tsx`, `ui/States.tsx` | Existing responsive list/detail | Gmail browser suite |
| Toast | Button and Sonner | `frontend/src/components/ui/Button.tsx`, existing Toaster | primary, secondary, ghost, danger; busy | Failure and duplicate-submit scenarios |
| Form | Field and Textarea | `frontend/src/components/ui/Field.tsx`, `ui/Primitives.tsx` | Gmail manual field validation, noValidate | Invalid-field focus and aria association |
| CRUD | AlertDialog | `frontend/src/components/ui/alert-dialog.tsx` | Busy asynchronous confirm stays open on failure | Escape, cancel focus, retry, successful close |
| Select/Listbox | Primitives Select | `frontend/src/components/ui/Primitives.tsx` | Existing native popup | Existing-screen browser acceptance pending |
| remote search | Gmail query hooks | `frontend/src/features/gmail/api.ts` | Explicit submit, app-owned clear; query keys isolate search results | Search, no-results, selection and clear-focus tests |
| conversation selection | Comunicacoes page state | `frontend/src/pages/app/Comunicacoes.tsx` | Selection independent of filtered inbox after send | Send under unrelated filter then refresh |

The additional remote-search and conversation-selection rows document Gmail-specific
state ownership. The shared native Select in Primitives owns existing browser popup
behavior; it is not presented as an authored listbox. Existing native date inputs
remain outside Gmail acceptance and still need locale/viewport verification.

## Additional canonical input ownership

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Primitives Select | `frontend/src/components/ui/Primitives.tsx` | Existing native popup; platform geometry accepted | Existing screens require separate browser acceptance |
| Date | Existing native date inputs | Current screen implementations | No date control added by Gmail | Locale and viewport matrix remains pending |
| Scrollbar | Global styles | `frontend/src/index.css` | Message history bounded, other forms natural height | Global cross-browser scrollbar debt remains pending |

## Gmail flow ledger

Search submits explicitly; typing does not issue requests. Clear resets the draft
and applied query and returns focus to the field. A different submitted search
resets the previous selection and reply. Query keys isolate tenant and search.
The first inbox result is selected only when there is no explicit selection and
compose is closed. Background refresh must not replace an open sent conversation
merely because it is outside the current inbox filter. The inbox filter does not
claim to search the entire mailbox.

Compose validates destination, subject and text before sending. Errors are visible,
associated with their field and focus the first invalid input. Failed requests
preserve all draft values. No automatic retry of a send is allowed: an uncertain
provider failure needs deliberate user recovery, not a silent duplicate email.
Successful send clears the submitted draft and opens the returned conversation.

Disconnect uses the canonical alert dialog, with Cancel initially focused.
Google revocation can invalidate this account's grants across the project, so the
confirmation discloses the effect on other barbershops using the same account.
Local disconnection still removes tokens if Google is unavailable. The response
only claims provider revocation after HTTP 200; otherwise the connect panel offers
a visible warning and the Google account permissions link. Cancel
or Escape makes no request and returns focus to its trigger. During a request the
action is busy and closing is blocked; failure leaves the dialog usable, success
shows the connect panel. This does not erase messages from the provider.

## Verification scope

## Team access lifecycle

The existing Field, native Select, Button, Sonner and AlertDialog also own team
access controls. The members feature API owns owner-only directory validation and
list/add/remove RPC calls. A manager does not request the owner directory from
barber configuration. Last-owner and self-removal policy remains server-owned.
Removal initially focuses Cancel; pending requests block closure/repetition;
failure preserves the dialog and retry; success returns focus to a surviving
control. Email validation is associated with its field. Tenant/account changes
discard old drafts and dialogs; late responses cannot overwrite the new context.
See `docs/MEMBERSHIP_UI_ACCEPTANCE_2026-11-24.md` and
`frontend/tests/e2e/members-ui.spec.mjs` for evidence and remaining limits.

## Gmail verification scope

The Gmail fixture runs the actual page, controls, query hooks and client with only
tenant context and external HTTP replaced. Desktop/mobile browser scenarios cover
selection, validation, provider failure, confirmation, focus, accessibility and
viewport overflow. Separate controlled production receipts prove actual OAuth,
read/send/reply and token refresh. Fixture success does not certify Google public
verification, staging credentials, other screens or real mobile hardware.
