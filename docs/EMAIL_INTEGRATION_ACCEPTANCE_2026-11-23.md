# Email integration acceptance

## Production infrastructure

The connected Supabase account authorizes production and staging. Production has
ten integration secrets installed through the encrypted Edge Functions secret
store. Only names and runtime presence were inspected in reports; credentials are
excluded from Git. A separate AES-GCM recovery artifact was decrypted and compared
with the original bytes; its recovery key is stored separately with mode 0600.

The Resend root-domain claim was abandoned because it belonged to another team.
The unused claim draft created during this session was removed without transferring
ownership. The isolated sending domain `notify.edmundokutuzov.art` is verified and
Forge is ready. Its DKIM TXT and two sending CNAME records were added at Hostinger
and independently resolved through public DNS. Existing root SPF, MX, DKIM and
website records were preserved. Receiving was not enabled.

The production Resend key has sending permission restricted to that domain.
The webhook subscribes to exactly `email.delivered`, `email.bounced` and
`email.complained`. Its signing secret is installed only in the backend.

## Executed acceptance

| Check | Evidence |
| --- | --- |
| Missing signature rejected | Live POST returned 401 |
| Valid signature authenticated | Signed diagnostic event returned 200 |
| Expired signature rejected | Correctly signed timestamp 600 seconds old returned 401 |
| Scheduler to provider | An isolated suspended QA tenant queued one email; pg_cron dispatched it |
| Delivery | Resend reports delivered to the approved Gmail account |
| Callback persistence | Resend received HTTP 200; the delivered event references the test notification |
| Duplicate callback | Provider Replay succeeded; event row count remained one and send attempts remained one |

Controlled notification: `e5e2e68b-2526-424e-8d79-9a8453773b26`.
Provider message: `01a20982-dd05-7152-ade9-55e747b0ce35`.
Provider event: `msg_3MWAMhbCUmhGv7TtE3PWG7IpZWB`.
The email was accepted at 17:45:01 UTC and the delivery event was created at
17:45:02 UTC on 2026-11-23. No historical failed notification was requeued.
No payment-provider flow was invoked.

## Gmail configuration and remaining gates

A dedicated Google project `barberos-production-20261123` was created under the
approved Gmail account without linking billing. Branding identifies BarberOS;
support and developer contacts use the approved addresses. The Gmail API is
enabled. A Web OAuth client uses the exact production Edge Function callback,
with no JavaScript origins required. The consent configuration has only
`gmail.readonly` and `gmail.send`; the approved Gmail account is a test user.

Gmail client credentials, callback, encrypted-token key and application URL are
installed on Supabase. Health confirms presence, not a completed connection.
An authorized connection, refresh, inbox/read/send test and revocation still need
end-to-end validation. Google publishing and restricted-scope verification remain
release gates; testing mode is not production certification.

Staging provider configuration, Google Calendar, WhatsApp and the remaining schema
reconciliation are not certified by the production email test. The deployed
notification worker also differs from source in its retry and automatic WhatsApp
fallback behavior; that drift requires a reviewed and tested deployment.

## Dispatcher repair decision

Three implementations were assessed: publish the existing monolithic source,
replace the queue/worker, or extract the per-notification delivery transition.
Publishing alone leaves rendering outside the durable failure boundary; replacing
the queue increases migration and retry risk. The selected extraction preserves
the queue, provider idempotency key and explicit channel selection while covering
preparation, delivery and persistence in one tested lifecycle.

Six dependency-injected Deno tests verify successful persistence, unsupported
templates, rate limiting, permanent versus temporary failures, post-send database
failure and failure-state persistence errors. All pass. The runtime typecheck
passes with `@supabase/server` pinned to the verified version 1.9.2. The first
typecheck exposed nullable fallback URLs; the extraction now preserves their
existing null semantics rather than inventing a fallback URL.

## Dispatcher rollout and authentication acceptance

Source commit `7a342d1` passed all four triggered workflows. The dispatcher is
active in staging version 1 and production version 7 with identical bundle SHA-256
`abf4d31ab33055a48a745dde3baa8c28b7e4bdef58dd988a68f510fa95c0c6d7`.
Both reject an unauthenticated scheduler request with 401.

The production version sent a new controlled email in one attempt and persisted
its delivered event. In the same batch, an unsupported template became `failed`
after one attempt, with no provider message ID; it did not remain `processing`.
This verifies the repaired transition against the real scheduler and database.

Supabase Auth previously had custom SMTP disabled, Site URL
`http://localhost:3000` and no allowed redirect URLs. It now uses encrypted TLS
SMTP on port 465 with an independently rotatable, domain-restricted Resend key.
The Site URL is the deployed frontend; only the exact app, communications and
password-reset paths were added. An existing approved owner requested a magic
link successfully. Resend reports delivery, and following the validated link from
the provider's own email preview established a real session at `/app/comunicacoes`.
The Gmail web search did not independently confirm inbox placement of that Auth
email; SMTP acceptance is not an inbox-placement certification.

## Gmail live acceptance and discovered regressions

The real frontend connect button completed the Google consent and backend callback
for the approved owner. The Gmail page displays the connected account. SQL confirms
encrypted access/refresh tokens, a current expiry and the granted scopes. A
controlled notification conversation was listed and read. A self-addressed Gmail
message was sent and read back with its Unicode subject and body preserved.

Two concrete regressions were reproduced: sending under an unrelated search resets
the selected conversation to an older visible row; replying to a self-addressed
conversation returns a false provider failure because the old resolver requires a
non-owner sender. The new reply resolver follows the latest message, respects
Reply-To, recognizes outgoing aliases using Gmail SENT metadata, preserves threading
headers and supports self-addressed replies. Nine Deno cases cover these boundaries.
Frontend selection repair, post-deployment reply, refresh and revocation acceptance
remain pending at this checkpoint. Google remains in testing mode.
