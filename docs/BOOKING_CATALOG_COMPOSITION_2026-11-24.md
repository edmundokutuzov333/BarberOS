# Booking catalogue composition — production rollout (2026-11-24)

## Domain model
- A service is the commercial base; a style can have a primary association and further tenant-scoped offers. Secondary offers may inherit service price/duration or override them independently.
- Explicit per-style skills optionally restrict eligible barbers; unrestricted styles retain existing service qualifications. No skills are inferred or falsely assigned.
- Service category/subcategory and permitted add-on relations are owner/manager managed. Only actual catalogue services are combined. Up to five distinct add-ons; total duration 5–480 minutes; a single barber qualified for every selected service and restricted style. Existing package offers inherit real package pricing.
- One transactional booking core with the existing advisory lock/exclusion constraint. Client quotes are checked against server totals, never authoritative; stale quotes fail. Idempotency and product order atomicity remain intact. Manual booking, waitlist, operator and customer rescheduling use the same rules.
- Historical service component snapshots immutable, reports allocate price/duration per service; deposits attributed to primary once. Older appointments remain intact and readable.
- Tenant-scoped composite foreign keys, RLS, atomic management RPCs; anonymous direct writes and raw booking RPCs denied. Existing public booking Edge Function retains its validation, rate limit and service-role-only gateway.

## Rollout receipts
- All three versioned migrations applied to staging and production; three acceptance scripts executed successfully in production (rollback fixtures).
- booking-create version 7 ACTIVE in both projects; identical bundle hash.
- Production: 45 services, five categories, 90 additional style offers, 45 compatible add-on relations, four shop records (including records without catalogue). No explicit restricted skills were invented. 16 existing appointments retained the same history digest 37496559e919d5429ac8f7e94972323d before/after.
- Read-only contract and generated TypeScript refreshed from live production. See GitHub Actions for frontend/browser and concurrency gate outcomes.

## Boundaries
Configured staff/service availability governs public visibility; blank shops still require actual service and staff setup. No payment provider enabled by this release. The composition scope uses one barber, not simultaneous appointments with multiple specialists.
