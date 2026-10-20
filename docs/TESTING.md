# BarberOS FASE 23: Test Architecture

A FASE 23 cria uma pirâmide de testes executável, mantendo o PostgreSQL como fonte de verdade.

## Database

`supabase/tests/phase23_contract.sql` é read-only e valida schema, RLS, grants, RPCs, overlap e Realtime.

`supabase/tests/phase23_behavior.sql` é rollback-only e prova availability -> booking -> slot invalidation.

As acceptance suites das fases anteriores continuam como provas de domínio especializadas e passam a ser executadas pelo runner dedicado quando existe uma base de testes isolada.

## Unit

`frontend/tests/unit/phase23-domain.mjs` carrega os módulos TypeScript reais através do Vite SSR e testa Meticais, slug, erros, calendário, WhatsApp e permissões.

## Components

`frontend/tests/components/phase23-components.mjs` carrega componentes React reais e verifica semântica renderizada de Button, StatusChip, Skeleton, EmptyState, ErrorState, Panel, Page e SkipLink.

## E2E

`frontend/tests/e2e/phase23.spec.mjs` usa Playwright em Chromium desktop e mobile.

O smoke é sempre executado contra o build de produção local. Página pública e booking são executados quando existe um ambiente E2E dedicado. O percurso autenticado usa apenas credenciais dedicadas.

Não existem testes mutáveis contra produção.

## CI

`.github/workflows/ci.yml` applies the full migration chain to an isolated local database and runs the pgTAP-compatible checks in `platform_access_security.test.sql` and `platform_core_contracts.test.sql`. These cover account recovery policy, audit-table access, booking concurrency, browser-role privileges, idempotency and public query indexes.

The legacy SQL acceptance files that depend on real shop, appointment, customer or payment fixtures remain in the dedicated-database workflow. They must not be treated as passed when `BARBEROS_TEST_DATABASE_URL` is absent; no production mutations are used to compensate for missing staging credentials.

`.github/workflows/phase23-tests.yml` triggers when the relevant frontend or backend surfaces change and runs accessibility, typecheck, production build, unit, component and browser E2E. Full lifecycle E2E requires a dedicated resettable test environment and dedicated credentials.
## Booking concurrency

`scripts/test_booking_concurrency_phase23.py` opens two PostgreSQL transactions against the same slot and asserts one successful booking plus one `SLOT_TAKEN` or `SLOT_UNAVAILABLE`. Cleanup removes only the dedicated fixture appointments.

## Full lifecycle E2E

`frontend/tests/e2e/phase23-full-lifecycle.spec.mjs` cobre registo, onboarding, configuração, página pública, booking sem conta, agenda, atendimento concluído e CRM. Exige `BARBEROS_E2E_FULL=1`, credenciais dedicadas e um reset endpoint privado do ambiente de teste. Nunca aponta para produção.

## FASE 24: concorrência

A FASE 24 adiciona uma fronteira HTTP pública `booking-create` para preservar o PostgreSQL como fonte de verdade e traduzir `SLOT_TAKEN` para HTTP 409. O contrato de sucesso é HTTP 200 com `manage_token`, `deposit_cents` e `needs_payment`, sem expor `appointment_id`.

A suite `scripts/test_booking_concurrency_phase24.py` exige um PostgreSQL dedicado e controla a ordem das transacções para provar A = sucesso, B = `SLOT_TAKEN` e uma única appointment activa no slot. `frontend/tests/e2e/phase24-http-concurrency.spec.mjs` verifica os estados HTTP 200/409 contra um ambiente dedicado e recusa explicitamente a produção.

Sem ambiente dedicado, estes testes fazem `SKIP` e a aceitação final da FASE 24 permanece aberta.
## FASE 25: performance

A FASE 25 adiciona budgets de assets, code splitting por rota e benchmark público em Fast 3G.

- `frontend/tests/components/phase25-performance-contracts.mjs` valida o corte de bundles e as regras de carregamento de imagens.
- `scripts/check-performance-budget.mjs` mede o grafo real do primeiro carregamento público usando o manifest do Vite.
- `frontend/tests/e2e/phase25-performance.spec.mjs` mede LCP, CLS, DOMContentLoaded, TTFB, RPC público e interação de laboratório sob Fast 3G.
- `supabase/tests/phase25_performance_contract.sql` valida os índices da superfície pública.
- `supabase/tests/phase25_public_rpc_benchmark.sql` mede o RPC público em modo read-only.

A aceitação de performance não executa mutações contra produção.


## Browser smoke tests (desktop + mobile)

Install the locked dependencies with Node 22, then install the Chromium runtime once:

```bash
cd frontend
corepack yarn install --frozen-lockfile
corepack yarn playwright install --with-deps chromium
corepack yarn test:e2e:smoke
```

The smoke suite starts a local Vite Preview server automatically when `BARBEROS_E2E_BASE_URL` is not set. It checks the landing, login and password-recovery routes, uncaught browser errors, serious or critical WCAG 2.1 A/AA issues, the unauthenticated redirect for the private agenda, and login overflow on a mobile viewport. These tests do not create or mutate bookings, customers, or production records. Set `BARBEROS_E2E_BASE_URL` only when intentionally testing a separate running environment. The wider `yarn test:e2e` suite includes tests that require a dedicated test tenant and credentials; follow each test's environment guard and never point mutating concurrency/full-lifecycle tests at production.
