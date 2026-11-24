# Reporting and partial-delivery backend acceptance

`reporting_boundary.sql` passes against the isolated migration-chain database,
production and staging. All identities/tenants are synthetic inside BEGIN/ROLLBACK;
no existing customer's records are changed and no provider is contacted.

The five real reporting RPCs verify summary/daily/service/haircut/barber values,
Maputo dates, two-barber capacity and the union of overlapping global and personal
time blocks (810 tenant minutes, 390 for the restricted barber). They check tenant
denial, anonymous denial, oversized/inverted ranges and attempts to widen a
barber's scope by explicitly selecting another barber. Expected appointment count
is two, completed count one and completed revenue 20,000 minor currency units.
This proves these cases, not every possible reporting filter or browser journey.

Staging previously had none of the seven report functions/helpers. Five existing
reviewed sources install them, including their historical alias fixes. All five
frontend reporting RPC gaps are closed. The updated catalog capture has 101
public functions and 39 public tables; 15 other frontend RPCs remain missing.

`shop_partial_delivery_boundary.sql` failed on production before repair with
`PARTIAL_DELIVERY_ALERT_MISSING`. It uses a synthetic prepared order with a partial
line and executes the real order trigger and inbox RPC. The published existing
source `20261026200000_shop_partial_delivery_notification.sql` fixes the omitted
event case and widens its check constraint. The same test then passes on local,
production and staging: exactly one internal alert, unchanged-status replay does
not duplicate it, and the owner sees it through the actual inbox RPC. This is an
internal notification test; it does not exercise payment APIs or certify the full
stock/delivery workflow.

The before production emitter, constraint and grants are retained in the private
release evidence. A rollback must preserve any new real partial-delivery alerts:
restoring the previous emitter can stop new emission, but the widened event check
must remain if rows of the new type already exist. Never delete legitimate events
to make an older constraint fit. Prefer a forward correction to retracting this
additive event. Both new permanent behavior tests run in the isolated CI database.
