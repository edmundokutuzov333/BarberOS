# Transactional catalog management acceptance

This is the first delivered store increment, not certification of the full store,
all-shop catalog rollout, payments, booking lifecycle, settings or themes.

## Decision and behavior

A separate commerce backend would duplicate booking, tenancy and inventory. A
catalog rewrite would replace existing tested constraints. This change extends
the existing PostgreSQL model through two narrowly scoped RPCs and a typed client.

Product creation now writes identity, image and provenance atomically. The browser
retains one product UUID across uncertain retries; identical retries do not create
another product or audit event. Updates compare the exact server row version.
Catalog versions advance monotonically, including writes in the same transaction.
Publication now verifies and publishes in the same transaction, records the actual
signed-in operator and preserves all existing image/category/variant/stock guards.
No fabricated human approval or physical inventory is inserted.

The UI uses inline validation, retains drafts after failures, reports conflicts,
requires a verification note, blocks closing while saving, and remounts all catalog
state when tenant or role changes. Queries are disabled outside owner/manager
roles. Product photos use contain sizing to preserve packaging.

## Validation actually executed

- TypeScript, ESLint, production build, complete frontend scripted suite: passed.
- Browser: 12/12 desktop/mobile cases passed after the final UI changes; covers
  invalid input/focus, response lost after create and retry, verified publication,
  stale publication, delayed mutation across tenant switch, serious/critical axe
  checks, narrow overflow and Escape.
- New SQL transactional suite: passed on an isolated restored PostgreSQL database,
  staging and production. All fixtures roll back. Covers image/create atomicity,
  canonicalized retry, stable audit count, monotonic versions, stale save/publish,
  rejected server fields, duplicate preferences, failed publication rollback,
  verification actor, tenant/role boundaries and anonymous denial.
- Existing catalog phase 2, catalog rules, phase 7 approval and public catalog SQL
  suites: passed on the isolated restored database.
- Supabase release contract and strict captured-history mapping: passed.
- Asset budget: initial JS gzip 250313 bytes; initial total gzip 267615 bytes,
  within repository limits.
- Premium static audit: no findings in the changed catalog page/module; 53 findings
  remain elsewhere in the application. This does not certify the whole UI.
- One initial desktop browser run timed out under host resource pressure. After
  stopping the owned local database VM, the unchanged scenario passed and all 12
  cases passed again following final UI changes.

## Deployment and limits

Source migration: `20261124063655_store_catalog_atomic_management.sql`.
Supabase generated history: staging `20261124064607`, production `20261124065614`.
The generated production TypeScript schema adds only the two new RPC contracts.
Both environments applied the same source SQL. No existing rows were seeded,
stock changed, payments enabled or published git history rewritten.

Real-product research and all-shop provisioning are the next store increment.
The pre-existing security advisories include leaked-password protection disabled
and btree_gist in public; role-checked API functions and server-only RLS tables also
appear in Supabase's generic advisory list. No all-clear is inferred from that list.
