# Frontend to backend contract inventory

## Method and architectural choice

Three approaches were assessed: text/regex searches, a TypeScript compiler API
inventory, and a Babel syntax-tree inventory. Text search cannot distinguish
comments, casts, generic calls or forwarding helpers. The installed TypeScript 7
package exposes its native checker but not the expected JavaScript compiler API.
The existing pinned Babel 7.29.7 parser was selected: it parses the actual TS/TSX
syntax without installing dependencies or executing application modules.

`inventory-frontend-contracts.mjs` reads all 164 frontend source files, resolves
imported Supabase aliases, casts, local forwarding helpers and finite string unions,
and separates RPCs, Edge calls, tables, Storage, Auth methods and route declarations.
Unresolved expressions remain explicit. Route counts include index declarations
and redirects, so 52 declarations are not claimed as 52 distinct usable screens.

`compare-frontend-contracts.mjs` compares live-captured catalog and function metadata.
For literal RPC objects it validates the complete named input set and required
arguments, with overloads checked as complete alternatives. Opaque argument objects
are listed rather than silently certified. Missing metadata is an error.

Eleven parser/comparator tests cover comments, aliases, casts, generic calls,
forwarding helpers, bounded unions, nested routes, optional/required arguments,
overloads, inactive endpoints and incomplete inventory. All pass.

## Captured result

Source uses 75 distinct RPC names, eight Edge Function names and 15 direct database
tables. Production has all of them. No unknown or missing required argument was
found in the literal payloads. Eight call sites pass opaque objects and need their
own runtime/typed contract acceptance. Presence and shape are not proof of
payload-value validation, permissions, return values, pagination or E2E behavior.

Staging is missing 20 frontend RPCs: all 14 platform administration methods, the
dashboard snapshot and five report methods. It is also missing
admin-credential-manager, google-calendar and the three browser-facing payment
functions. No payment provider was called or tested by this inventory.

The captured inventories and exact gap lists are in `docs/contracts/`. They contain
structure, signatures, privilege flags and bundle hashes, not credentials or
customer rows. The production gate in CI checks new source against this dated
snapshot. It does not refresh the live database automatically; deployments and
migrations require a new capture and runtime validation. The stage snapshot remains
an explicit failing report until the missing backend is reconciled.

## Reproduction

From the repository root after the locked frontend dependency installation:

```sh
node --test scripts/inventory-frontend-contracts.test.mjs scripts/compare-frontend-contracts.test.mjs
node scripts/inventory-frontend-contracts.mjs > /tmp/barberos-frontend-contracts.json
node scripts/compare-frontend-contracts.mjs /tmp/barberos-frontend-contracts.json docs/contracts/production-2026-11-24.json
node scripts/compare-frontend-contracts.mjs /tmp/barberos-frontend-contracts.json docs/contracts/staging-2026-11-24.json
```

The final command intentionally exits nonzero for the currently missing staging
contracts. `--report-only` preserves the same gap result while allowing inventory
collection to continue; it does not turn staging green.

## Next base work

Reconcile stage reporting, administration, password-change prerequisites and their
policies from reviewed source/production contracts; test each tenant and admin
boundary before deploying the corresponding functions. Continue the 36 unresolved
historical source dispositions and restore acceptance. Replace remaining casts in
critical commerce/admin flows with typed contracts after schema intent is settled.
No phase is declared complete by this inventory alone.
