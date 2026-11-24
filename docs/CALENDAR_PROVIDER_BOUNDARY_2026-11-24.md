# Calendar provider transport acceptance

The existing Calendar function had no deadlines on Google token/event requests
and accepted any successful event HTTP response without validating the returned
event. It also was not included in the integration runtime typecheck job. Adding
that check reproduced a typed-array BufferSource error in state decryption; the
base64 decoder now accurately returns an ArrayBuffer-backed Uint8Array.

## Architectural choice

Inline timeout additions would retain duplicated transport/error handling and
make testing depend on booting Deno.serve. Extending a global HTTP framework would
introduce unnecessary changes to unrelated integrations. The selected provider
module isolates token exchange and event insertion/update while the existing entry
point retains configuration, account-independent booking-token authorization,
encrypted state, rate limiting, event content and callback routing.

Every Google request now has a ten-second abort signal, including body reads.
Transport failures, malformed JSON, rejected status and missing credentials in the
response become the existing sanitized GOOGLE_CALENDAR_PROVIDER_FAILED code.
Redirect following is rejected so credentials cannot be forwarded to an unexpected
destination. A failed or uncertain write is not retried automatically.

The event keeps its deterministic booking-derived ID. A 409 permits one PATCH to
that same ID, without resubmitting the immutable ID in the body. Both writes use
sendUpdates=none and introduce no attendees. HTTP success only becomes an added/
updated receipt if the returned identity matches and status is confirmed/tentative.
Empty responses, another identity and cancelled state cannot claim success.

This follows the provider's documented [event ID and duplicate prevention](https://developers.google.com/workspace/calendar/api/guides/create-events)
and [event resource/identity rules](https://developers.google.com/workspace/calendar/api/v3/reference/events).
The existing owned-calendar scope is accepted by the official
[insert method](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Verification and remaining rollout

Twenty-two native Deno cases pass without network permission: bounded token
exchange, malformed/missing/blank tokens, network failure, actual abort on stalled
headers and response bodies, event identity, duplicate PATCH, provider 401/429/500,
failed/stalled PATCH, invalid identities and false HTTP-success responses. The
entire non-payment Edge boundary command passes 72 cases. The complete Calendar
entrypoint typechecks; all seven frontend Calendar contract checks and repository
secret scan pass. CI now checks this entrypoint and runs the provider cases.

These are controlled provider-boundary tests. OAuth configuration, API enablement,
Google public app verification, cloud deployment and real event creation/readback
remain separate gates. The function is not certified operational merely from these
tests. Production/staging promotion must use the reviewed published sources after
CI succeeds. No Google account token, authorization code or real calendar event is
included in this test artifact. No payment provider was called.
