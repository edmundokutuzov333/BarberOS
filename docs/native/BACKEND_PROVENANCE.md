# Backend provenance for native clients

Verified against the production and staging migration history on 2026-11-24.
The native clients use the hosted application's existing Supabase integration;
no independent database schema, credentials or migrations run in the installers.

Two previously applied store migrations were missing from main. Their SQL was
retrieved from each cloud migration history and compared with the original
source: both environments contain exactly the same SQL (ignoring trailing
whitespace). The original source files are now versioned, without rerunning DDL
or changing production data.

| Source migration | Production recorded version | Staging recorded version |
| --- | --- | --- |
| 20261124121506_store_order_workspace.sql | 20261124123004 | 20261124121713 |
| 20261124122134_store_partial_readiness.sql | 20261124123013 | 20261124122235 |

The historical management-tool timestamps differ from the original source
filenames. This reconciliation preserves those historical records; it does not
claim that all legacy migration identifiers are identical or repair them.
Never blindly replay historical migrations against production to resolve those
identifier differences.

`frontend/src/lib/database.generated.ts` was regenerated directly from the
production schema. Its only additions are the two previously missing RPCs
`get_shop_order_workspace` and `deliver_shop_order_item`. SQL argument
nullability is reviewed separately in `database.types.ts`, because PostgreSQL's
catalog generator does not encode it.

`supabase/tests/shop_order_workspace.sql` exercises manager access, minimal
member details, tenant-local dates, pagination, preferences, partial delivery,
response-loss idempotency, stale-quantity conflicts, terminal history and
cross-tenant/anonymous denial. It ran successfully on staging inside an explicit
BEGIN/ROLLBACK; a follow-up query confirmed zero remaining fixture shops.
The test is also included in the isolated database CI suites.

This is a reconciliation of already deployed contracts, not a new native-only
business API. Store UI work from an earlier local workspace is not included.

Production privilege inspection confirmed that both reconciled RPCs deny EXECUTE
to anon, permit authenticated callers, fix an empty search_path and check the
requesting user's tenant role inside their SECURITY DEFINER bodies. The security
advisor still reports existing project warnings (extension placement, privileged
RPC review notices and leaked-password protection disabled). This native release
does not certify those unrelated historical findings as resolved.
