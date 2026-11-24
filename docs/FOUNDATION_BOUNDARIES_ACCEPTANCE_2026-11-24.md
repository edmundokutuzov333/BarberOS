# Gateway, tenant, administration and notification boundaries

The following permanent SQL suites pass in the isolated local database, production
and staging. Fixtures are synthetic and enclosed in transactions that roll back.
Provider calls, credential resets and committed customer mutations are excluded.

| Suite | Actual behavior checked |
| --- | --- |
| `booking_gateway_foundation.sql` | Private cache/RLS, service-only rate consumption, browser denial of raw booking, two allowed requests then denial, management-token preservation and default/explicit expiry. |
| `tenant_immutability_boundary.sql` | An authenticated owner of two tenants can edit legitimate root/child fields but cannot reparent the child to the other owned tenant. |
| `platform_admin_boundary.sql` | Regular-user denial despite spoofed user metadata, 13 non-payment admin methods, search, plan assignment/update, status replay without duplicate audit, support assignment/clear/resolution, date series, invalid limit and anonymous/catalog denial. |
| `notification_channel_boundary.sql` | Email confirmation and two future reminders are queued; WhatsApp is disabled; legacy producer inserts are marked skipped; the enqueue RPC is not browser executable. |

These are specific database proofs, not complete UI acceptance, gateway-load or
payment integration certification. The admin payment-list RPC is catalog-reviewed
only. The separate password-rotation SQL candidate still awaits cloud deployment;
normal-account admin acceptance does not close that blocker.

## Staging administration

Preflight found no support table/types, no admin RPCs/guard and zero real platform
administrators. Seven existing source migrations were reviewed and applied
unchanged at versions `20261124001902`, `20261124001906`, `20261124001910`,
`20261124001913`, `20261124001917`, `20261124001920`, `20261124001924`.
The synthetic behavioral suite passes before/after against local/production and
after installation against staging; every synthetic administrator disappears on
rollback. No real user was promoted. History now contains 135 staging records.
Only the dashboard remains absent among frontend RPC names. The credential Edge
Function has not been deployed to staging pending the authoritative SQL boundary.

## Production channel policy

Preflight confirmed no platform settings/channel trigger and zero processing or
queued WhatsApp jobs. Existing source `notification_channels_email_first` was
applied unchanged at version `20261124041229`, bringing production to 147 history
records. It installs the email-first switch and protects legacy producers too.
The three-argument signed-webhook event recorder remains intact; the historical
two-argument recorder is service-only. Historical failed jobs were not retried.
The dispatcher already supplies a notification-ID-based Resend idempotency key.
This queue test does not claim provider delivery of reminder/review templates.

Both environments now have the same 40 public table names, all with RLS enabled.
Column, function and policy differences remain. Production types were regenerated
directly from the current Supabase schema; the narrow nullable-argument adapter
and frontend typecheck continue to pass.

## History decisions

Gateway prerequisites are behaviorally represented in both environments and do
not need the old mixed source replayed. Tenant immutability is implemented by the
JSON-safe reparent guard in production and 14 tenant-move triggers in staging.
Both implementations pass the actual owner test. The old migration's forced
Oryon theme override is not replayed: production currently persists `speakeasy`.
Preserving that setting avoids silently resetting an existing presentation.

Alongside eight explicitly retired seed/prototype dispositions, these verified
decisions reduce the remaining source gate to nine staging sources, none in
production. This remains a NO-GO for release: remaining review, permission,
password and public-profile reconciliation must preserve later token lockdowns.
Replaying their old blanket grants would re-expose token operations.
