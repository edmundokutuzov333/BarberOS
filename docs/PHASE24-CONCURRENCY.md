# BarberOS FASE 24: concorrência de marcações

## Objectivo

A mesma vaga não pode ser ocupada por duas marcações concorrentes. O contrato de produção é:

1. Cliente A e Cliente B pedem exactamente o mesmo serviço, barbeiro e horário.
2. O PostgreSQL serializa a decisão através de pg_advisory_xact_lock.
3. A segunda transacção volta a consultar get_available_slots.
4. A primeira cria a marcação.
5. A segunda recebe SLOT_TAKEN.
6. A fronteira HTTP pública traduz SLOT_TAKEN para 409 Conflict.
7. O cliente recebe apenas manage_token, deposit_cents e needs_payment.

A exclusion constraint appointments_no_overlap permanece como última barreira contra sobreposição.

## Fronteira de serviço

Cliente sem conta
↓
React Booking Wizard
↓
Supabase Edge Function: booking-create
↓
PostgreSQL: book_appointment()
↓
advisory lock + availability recheck
↓
appointments_no_overlap
↓
200 { manage_token, deposit_cents, needs_payment }
ou
409 { error: "SLOT_TAKEN" }

A Edge Function não contém regra de disponibilidade. Ela é apenas a fronteira HTTP e a normalização do erro. A regra permanece no PostgreSQL.

## Protecção de UX

Enquanto o pedido está em execução, o botão de confirmação fica desactivado. Em conflito, o wizard informa que o horário acabou de ser ocupado, limpa o horário seleccionado, regressa ao passo de hora e recarrega a disponibilidade real.

Não é feito retry automático de uma marcação concorrente. Isso evita a criação involuntária de uma segunda marcação num horário diferente.

## Testes

supabase/tests/phase24_concurrency_contract.sql verifica advisory lock, SLOT_TAKEN, exclusion constraint, grants públicos do RPC e ausência de INSERT directo em appointments.

scripts/test_booking_concurrency_phase24.py executa duas transacções PostgreSQL reais num ambiente dedicado. A é deliberadamente mantida aberta no ponto de commit, B entra depois, bloqueia no advisory lock e só continua quando A faz commit. O teste exige A = sucesso, B = SLOT_TAKEN e uma única appointment activa para o slot.

frontend/tests/e2e/phase24-http-concurrency.spec.mjs testa a fronteira HTTP num ambiente dedicado e exige exactamente os estados 200 e 409. O teste recusa explicitamente a URL do projecto de produção.

## Ambiente

A aceitação mutante não é executada contra a produção. O CI usa BARBEROS_TEST_DATABASE_URL para o PostgreSQL dedicado e BARBEROS_E2E_CONCURRENCY_* para o endpoint HTTP dedicado.

Sem essas variáveis, os testes não inventam uma aprovação. O job fica marcado como SKIP e a FASE 24 permanece aberta até a prova real ser executada.
