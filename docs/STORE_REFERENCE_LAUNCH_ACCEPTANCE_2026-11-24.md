# Real reference catalog rollout

## Delivered scope

Every existing production barbershop now has its own 23 published products (92
products and 92 variants total). The normal authenticated create_barbershop
transaction provisions the same initial catalog for each future shop. Imports are
idempotent, preserve merchant changes/hidden categories and isolate tenant rows.

The catalog includes water, soft drinks, juices, snacks, packaged coffee/capsules
and personal/hair care. Exact retailer SKUs, formats, initial configured selling
prices, source pages, photo URLs, dimensions, capture times and image SHA-256 are
versioned in catalog/store-reference.v1.json. Sources are Mega Distribuição de
Moçambique and Casa Milad Maputo. Zero-price/no-photo records and ambiguous Bump
Patrol volumes were excluded. No alcohol is activated.

These are real products and photographs, not demo rows. Initial selling prices are
configured from the cited retailer offers; they are not a supplier integration or
an assertion of a shop's old prices. All initial products require staff confirmation.
Physical stock remains zero/untracked: no invented units, purchase records or
inventory reservations were created. New requests persist as needs_confirmation,
with canonical server prices and the existing booking/order idempotency contract.

Existing shops were imported by an explicitly privileged service operation. Human
approval IDs remain null for that operation; the protected reference_online mode,
source match, actual source record and system-origin audit distinguish it from a
manual physical verification. Future normal shop creation records its actual
signed-in owner, with an explicitly automatic online-reference verification note.

The public catalog is now server controlled without the obsolete build-time
rollout gate. Search has an accessible clear action, photos preserve packaging,
unknown availability is labelled, and skipping products is offered before search.
The mobile summary sticks above the list instead of covering quantity controls;
the booking layout retains its separate desktop summary.

## Payments deliberately unavailable

The server-only platform payment setting is false. Existing shop deposit flags
were disabled; attempts to enable deposits are rejected. Payment initialization
and manual store payment recording fail before charging/recording anything. No
payment methods are advertised while disabled. Frontend initiation/configuration
also reject before any HTTP call, provider settings/deposit controls/store payment
recording display the shared unavailable state, and pending-appointment pages do
not offer payment actions. Existing historical financial records are preserved.

## Executed evidence

- New provisioning SQL, payment-off SQL and atomic-catalog SQL passed locally,
  staging and production; cloud fixtures were enclosed in rollback transactions.
- Provisioning covers normal create RPC, second tenant, 23 initial products,
  source/system versus real operator attribution, zero invented stock, canonical
  order subtotal, needs_confirmation persistence, booking retry, no deposit,
  merchant-price preservation, role/tenant denial and password rotation denial.
- 30 existing nonprovider SQL suites passed on the owned isolated restored DB.
  Pure SQL legacy payment arithmetic/ledger fixtures enable the server flag only
  inside their rollback transaction. The two deferred provider suites were not run.
- Existing atomic order, operational transitions, catalog publication, public
  catalog, internal notifications/reporting and integrated ledger regressions passed.
- Frontend scripted suite, TypeScript, ESLint, production build, asset budget,
  strict captured migration-history mapping and live API metadata comparison passed.
- Browser management/store suite: 20/20 desktop/mobile cases passed. Following
  visual fixes, all eight public-store/payment UI cases passed again. Covers real
  23-product catalog, search/category/empty/cart/skip, unknown availability,
  payment API rejection with zero HTTP calls, axe serious/critical and narrow layout.
- All 23 product photos were downloaded from the canonical production domain;
  every SHA-256 matched the committed asset, beyond merely checking HTTP 200.

## Applied migration history

Source 20261124070136_store_reference_catalog_provisioning.sql:
production 20261124072814, staging 20261124072337.

Source 20261124071304_payments_unavailable_for_store_launch.sql:
production 20261124072818, staging 20261124072341.

No published git history or Supabase migration records were rewritten.

## Limits and remaining work

This evidence does not prove physical stock, a supplier agreement, image licensing,
staff training or physical delivery. Image ownership is attributed; no license was
invented. The full platform is not certified for launch by this increment: order
and appointment hardening, access/entry UX, complete settings and themes (last)
remain in the requested execution order. The full premium static audit still has
pre-existing findings elsewhere in the application. Production browser acceptance
of the newly deployed public wizard is recorded separately after deployment.
