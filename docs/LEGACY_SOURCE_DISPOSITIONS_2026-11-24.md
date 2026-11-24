# Reviewed historical source dispositions

Historical SQL is preserved unchanged. A missing name is not permission to replay
old data writes over owners' shops. Each disposition below approves the exact
source SHA-256 recorded in the history snapshot. Retirement reviews without a
fingerprint, or with changed source bytes, fail validation. This is an explicit
decision against deploying that old source, not a claim it ran on the server.

| Source | Environments deliberately not replayed | Reason |
| --- | --- | --- |
| `20261019180000_complete_public_shop_profiles.sql` | Production, staging | Fills every incomplete tenant with invented contacts, addresses, coordinates and social accounts. Missing real information must stay missing until confirmed. |
| `20261019140257_default_haircut_photos_and_moz_demo_data.sql` | Staging | Inserts default catalogues into all shops and replaces staff identity/experience, contacts and hours with fictitious data. |
| `20261019144435_refine_haircut_reference_photos_and_demo_profiles.sql` | Staging | Data-only companion adjusting demo photos/copy; no required API/schema object. |
| `20261020053148_publish_shop_photos_and_polished_profiles.sql` | Staging | Removes fictional/demo disclosures from three seeded shops. Replaying this does not make those venues real. |
| `20261020055726_repair_barber_hours_for_published_team.sql` | Staging | Copies hours to staff of three hardcoded demo slugs; preserve shop-owned schedules. |
| `20261019150000_platform_foundations.sql` | Production, staging | Unwired prototype integrations and alternate commerce schema; no runnable management/worker lifecycle. |

The foundation prototype defines member_invites, portfolio_items, products,
stock_movements, api_keys, webhooks, webhook_deliveries and push_subscriptions,
plus soft-delete/marketing fields and anonymize_customer/export_customer_data.
Repository searches find no frontend or Edge consumer of these contracts. The
actual commerce flow uses shop_products, shop_product_variants and
inventory_movements. Deploying these extra objects would create parallel models
and public/privacy entry points without a complete product contract. A future
privacy/invitation/webhook feature must be designed and tested against the actual
customer and tenant lifecycle rather than activating these prototypes by name.

The legacy fresh reset still creates those eight unused prototype tables. They
remain explicit schema drift; this decision does not erase them, certify fresh
schema parity or remove historical migrations. A later reviewed incremental
cleanup must prove their emptiness and lack of dependencies before removing any
artifact. Existing cloud data was not deleted or rewritten by these dispositions.

Eight environment/source dispositions are retired, reducing the history gate from
29 unresolved sources to 21. The strict release status remains NO-GO. Functional
authorization, administration, public profile payloads and other missing contracts
remain open; they are not retired by association with demo data.

Subsequent verified gateway/tenant decisions and prerequisite deployments bring
the current remainder to nine staging sources, zero production sources. See
`FOUNDATION_BOUNDARIES_ACCEPTANCE_2026-11-24.md` for the additional runtime evidence.
