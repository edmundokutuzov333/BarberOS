# Account verification and recovery acceptance

## Root causes and selected design

AuthProvider ignored getSession/profile errors and missing rows. RequireAuth and
the recovery route then waited forever for a profile that would never arrive.
Profiles were only reloaded when the user ID changed, leaving rotation/admin state
stale in an already open session. ShopProvider could query tenant data before
account verification and interpreted an unsuccessful membership query as an empty
shop list, sending the user into onboarding.

Three options were assessed: more local effects in each route, a separate bespoke
state machine, and the existing TanStack Query lifecycle under one AuthProvider.
The shared query lifecycle was selected. It supports cancellation, bounded profile
fetches, cache isolation, reconnect/focus verification and explicit retry without
duplicating account rules across screens. Server authorization remains mandatory.

## Implementation

- Session bootstrap has a ten-second deadline and a sequence guard: a late initial
  session cannot replace a newer Auth event. Callbacks do not await SDK work while
  Auth holds its session lock.
- Profile requests have a ten-second abort deadline, cancellation on lifecycle
  changes, no automatic retries and runtime validation. ID must match the current
  user and the security flags must be real booleans. Missing/invalid data fails
  closed with an explicit retry/sign-out surface shared by app, admin and recovery.
- Profile cache boundaries change with the account. Same-account Auth events
  revalidate outside the SDK callback without discarding a live form. The browser
  regression reproduced a lost draft from incrementing that boundary on every
  SIGNED_IN event; the corrected logic preserves the draft and still applies a new
  password-rotation requirement after revalidation.
- Tenant reads are enabled only after valid account state with no rotation flag.
  Failed membership loading has its own retry state and cannot imply that the user
  should create another shop. Disabled queries do not expose cached shop data.
- Context sign-out reports success/failure explicitly. Failed logout cannot cause
  the admin switch-account action to claim success or create an unhandled promise.
  The shared error screen permits another deliberate sign-out attempt.

## Actual verification

Thirty-four desktop/mobile cases passed against the real production-built App
router, SDK, AuthProvider, ShopProvider and route guards, with only external HTTP
controlled. They cover direct recovery, absent sessions, forced and ordinary own
password changes, failure/retry, weak/mismatched values, missing/invalid/wrong-user
profiles, HTTP failure, actual ten-second request timeout, private/admin denial,
tenant-query suppression, membership retry, logout failure/retry, same-account
draft preservation and a newly required rotation. No real password was changed.

The separate Gmail and team browser suites passed again: 36 desktop/mobile cases.
Typecheck, lint and the full frontend unit/component/contract command pass.
The production-built public smoke suite passed 29 checks, with one intentional
desktop skip for the mobile-only viewport case. Its initial invocation used the
controlled-test dummy key against a live read-only public RPC, producing 401s;
the trace confirmed the setup error. Rebuilding with the published CI public
configuration restored the real public-shop and service-step checks. This was
corrected in the test invocation without changing shop data or authorization.
The global premium audit remains at 61 findings, including existing password-form
validation ownership and unrelated public/barber CRUD debt. This change repairs
verification/recovery; it does not claim complete application UX certification or
an actual cross-account concurrent-response browser test.

## Live staging service

Staging admin-credential-manager was absent. Its rotation column, access-audit table
and rate limiter were inspected before deployment. The published main sources were
verified byte-for-byte, then deployed as version 1 with JWT verification enabled.
Bundle SHA-256 matches production version 9:
`d95ad9aac719dbb12191efccd5bde4e7788f84c3e4a2cb4ba0935eccd2768c3c`.
Actual HTTP checks: approved-origin OPTIONS 204 with the exact origin; untrusted
origin OPTIONS 204 without an allow-origin header; unsigned POST 401 from the
Supabase gateway. The gateway's generic 401 has its own wildcard CORS header; that
does not grant access to protected application responses. No admin credential was
reset by these checks. Staging still lacks Calendar and three payment endpoints;
payment-provider tests remain deferred. Function presence is not E2E acceptance.
