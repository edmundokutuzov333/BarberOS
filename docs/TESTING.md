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

`.github/workflows/phase23-tests.yml` executa accessibility, typecheck, production build, unit, component e browser E2E. A suite de database entra quando o secret `BARBEROS_TEST_DATABASE_URL` está configurado.

A ausência desse secret não é transformada numa falsa aprovação de database.

## Release Gate

A FASE 23 só fica fechada quando a pirâmide de testes está instalada e as suites que tenham ambiente dedicado executam contra esse ambiente.

## Booking concurrency

`scripts/test_booking_concurrency_phase23.py` opens two PostgreSQL transactions against the same slot and asserts one successful booking plus one `SLOT_TAKEN` or `SLOT_UNAVAILABLE`. Cleanup removes only the dedicated fixture appointments.

## Full lifecycle E2E

`frontend/tests/e2e/phase23-full-lifecycle.spec.mjs` cobre registo, onboarding, configuração, página pública, booking sem conta, agenda, atendimento concluído e CRM. Exige `BARBEROS_E2E_FULL=1`, credenciais dedicadas e um reset endpoint privado do ambiente de teste. Nunca aponta para produção.

## FASE 24: concorrência

A FASE 24 adiciona uma fronteira HTTP pública `booking-create` para preservar o PostgreSQL como fonte de verdade e traduzir `SLOT_TAKEN` para HTTP 409. O contrato de sucesso é HTTP 200 com `manage_token`, `deposit_cents` e `needs_payment`, sem expor `appointment_id`.

A suite `scripts/test_booking_concurrency_phase24.py` exige um PostgreSQL dedicado e controla a ordem das transacções para provar A = sucesso, B = `SLOT_TAKEN` e uma única appointment activa no slot. `frontend/tests/e2e/phase24-http-concurrency.spec.mjs` verifica os estados HTTP 200/409 contra um ambiente dedicado e recusa explicitamente a produção.

Sem ambiente dedicado, estes testes fazem `SKIP` e a aceitação final da FASE 24 permanece aberta.