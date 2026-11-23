# Gmail UI repair and acceptance

## Architectural decision

Three approaches were evaluated for post-send selection: clear every search after
send, insert a synthetic sent row into a filtered inbox, or keep detail selection
independent of the list. Clearing search discards user context; a synthetic row
misrepresents the filter. Independent detail selection preserves both contracts.
Explicit search, row selection and tenant change still replace the selection;
background refresh does not. Pending completion from an old tenant cannot change
the newly active tenant's detail, draft or busy state.

Confirmation reuses the existing Radix AlertDialog owner, converted from inferred
JavaScript props to typed TypeScript. It starts on Cancel, supports Escape/focus
restoration, blocks closing while busy and remains open after failure. No new
screen-local overlay or token system is introduced.

Field validation uses the existing Field and shared Textarea owners. Textarea now
supports forwarded focus, stable generated IDs and associated visible errors.
Separating its label from the textarea also fixes label lookup after a controlled
value changes. The shared Textarea uses adequate rows and no manual resize.

Visual inspection found `.glass { position: relative }` overriding fixed dialog
placement. AlertDialog now uses the canonical surface tokens without inheriting
glass geometry. The existing generic Modal explicitly preserves fixed placement
and restores the opener for controlled usages without a Radix Trigger.

## Verification

`yarn --cwd frontend test:e2e:gmail` runs actual page/controls/query hooks/client
against an intercepted external HTTP boundary and a test tenant context. It does
not send real email. All 16 scenarios pass across the two browser projects. Desktop Chromium and a Pixel 7 viewport cover:

- composing under an unrelated inbox filter, then refreshing and clearing;
- inline validation, field focus, retained draft and explicit provider retry;
- confirmation cancel/Escape, focus, failed disconnect and successful recovery;
- scoped accessibility audit and screenshots of inbox and confirmation;
- slow send followed by a tenant switch, with no stale UI overwrite;
- no-results search and clear recovery;
- truthful recovery when provider revocation is unconfirmed;
- the shared glass modal's position, long-content actions and return focus.

The production OAuth/send/reply/refresh and negative authorization receipts are in
`EMAIL_INTEGRATION_ACCEPTANCE_2026-11-23.md`. Browser fixtures complement these
checks; they do not substitute for live provider acceptance or real-device tests.

## Remaining global UI debt

The strict premium auditor scans the whole `frontend/src`, not only Gmail. At this
checkpoint it reports 62 findings: 24 statically actionless buttons (require
individual review because wrappers can own behavior), 17 forms without noValidate,
14 literal textareas without resize ownership, six undecided native date controls,
and one WebKit-only scrollbar rule. The three changed UI owners have no findings.
This is an explicit failed global audit, not application-wide UX certification.
The maintained noir/brass design and behavioral ownership are now recorded in
`DESIGN.md`, `UX-CONTRACT.md` and `premium-ui.json`; runtime tokens stay canonical.

Google public publishing/verification, staging provider
credentials, the remaining database-history dispositions and all other phase
acceptance gates remain open until separately demonstrated.

## Revocation semantics

The old disconnect path ignored Google's HTTP result and unconditionally claimed
success. Three approaches were considered: retain all local credentials on a
provider failure, erase locally and claim full revocation, or erase locally while
reporting provider confirmation separately. The last option is selected: local
access ends even during a provider outage, while the UI cannot silently claim the
remote grant was revoked. A 10-second request limit prevents an indefinite wait.
Six Deno tests cover confirmation, rejected requests, provider outage, transport
failure, corrupt ciphertext and the bounded POST request. The confirmation also
discloses Google's project-wide grant invalidation for the same account.

Provider behavior source: [Google OAuth web-server revocation documentation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).

## Account-state boundary extension, 2026-11-24

The suite now has 18 passing desktop/mobile scenarios. A server denial requiring
password rotation hides the cached inbox/detail, disables new detail reads and
provides real navigation to the existing password-change flow. The HTTP account
policy and pending SQL reconciliation are documented separately in
`PASSWORD_ROTATION_RECONCILIATION_2026-11-24.md`; this browser fixture does not
claim the pending SQL candidate is already deployed.
