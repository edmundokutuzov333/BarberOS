# BarberOS Database

## Fonte de verdade

O PostgreSQL do projecto Supabase é a fonte de verdade do domínio.

A pasta `supabase/migrations` é a representação reproduzível dessa base. A aplicação não cria tabelas, enums ou funções de domínio em runtime.

A ordem actual é:

1. `20260918132000_initial_schema.sql`
2. `20260918132200_rls.sql`
3. `20260918132400_engine.sql`
4. `20260918132513_security_hardening.sql`
5. `20260918134600_domain_integrity.sql`
6. `20260918134657_domain_integrity_contract.sql`
7. `20260918135712_atomic_barber_save.sql`
8. `20260918140253_availability_engine_2.sql`
9. `20260918140609_availability_security.sql`
10. `20260918141607_booking_engine_2_0.sql`
11. `20260918141851_20260918162700_booking_engine_2_0_phone_normalization.sql`
12. `20260918141926_20260918163000_booking_engine_2_0_returning_fix.sql`
13. `20260918142515_booking_engine_2_0_indexes.sql`
14. `20260918143050_appointment_token_view.sql`
15. `20260918143124_appointment_token_cancel.sql`
16. `20260918143139_appointment_token_reschedule.sql`
17. `20260918143239_appointment_token_view_customer_name.sql`
18. `20260918143317_appointment_token_cancel_returning_fix.sql`
19. `20260918143353_appointment_token_public_boundary.sql`
20. `20260918143427_appointment_token_slots.sql`
21. `20260918143814_appointment_token_cancel_lock.sql`
22. `20260918144500_appointment_token_cancel_returning_fix.sql`

As versões 1 a 3 foram reconciliadas com o estado que já existia na base viva. A versão 4 já estava aplicada e foi mantida com a mesma versão no histórico Supabase.

## Reconciliation procedure

Nunca executar novamente as migrations antigas directamente contra produção.

Quando o schema mudar:

1. criar uma nova migration versionada
2. aplicar a migration através do fluxo Supabase
3. validar o estado do PostgreSQL
4. validar o frontend através dos tipos gerados
5. executar os testes read-only
6. só então continuar para a camada seguinte

A tabela `supabase_migrations.schema_migrations` foi reconciliada para reflectir as três migrations que já existiam materialmente na base antes desta fase. Os SQL registados foram comparados com os ficheiros do repositório e correspondem exactamente.

## Baseline actual

Estado verificado em 18 de Setembro de 2026:

- 18 tabelas no schema public
- 13 enums do domínio
- 42 índices no schema public após a Fase 5
- 94 constraints no schema public
- 4 buckets de Storage
- timezone padrão de negócio: Africa/Maputo
- extensão btree_gist necessária à constraint de anti-overlap
- publicação supabase_realtime sem tabelas de domínio configuradas neste momento
- cron schema/job ainda não configurado neste momento

O estado de realtime e cron não é corrigido nesta fase porque pertence às fases funcionais respectivas.

## Domain boundaries

A cadeia de dados mantém a seguinte separação:

React + Vite
  |
Supabase JS
  |
PostgREST / RPC
  |
PostgreSQL + RLS
  |
Storage / Auth / Realtime / Jobs

Operações críticas permanecem em PostgreSQL. O frontend não deve introduzir uma segunda implementação de regras de negócio.

## Frontend schema contract

Os tipos gerados do Supabase estão em:

`frontend/src/lib/database.types.ts`

O cliente Supabase é criado como `createClient<Database>`, e os tipos de domínio de `frontend/src/lib/types.ts`, `shop.tsx` e `auth.tsx` derivam do schema gerado.

Isto torna alterações de banco visíveis ao TypeScript antes de chegarem à produção.

## Seeds

Não existe seed de dados de clientes, marcações ou outros dados demonstrativos.

Os únicos dados base declarativos existentes são os planos de produto definidos pela migration inicial.

## Safe operations

Não usar `scripts/run_sql.py` para produção.

Mudanças de schema entram por migrations.

Testes mutáveis usam exclusivamente uma base de teste e precisam da guard explícita definida nos scripts.

## Phase 2 acceptance

O teste read-only está em:

`supabase/tests/migration_phase2.sql`

Ele valida:

- cadeia de migrations
- nomes e versões
- objectos essenciais
- constraints críticas
- functions de domínio
- integridade básica do baseline

## Phase 3: integridade do domínio

Foram adicionados índices únicos para a grelha base e overrides de horários e para a ligação opcional entre conta e barbeiro por loja. O PostgreSQL valida limites numéricos relevantes e relações entre entidades para impedir referências cruzadas entre tenants.

A reordenação de serviços, cortes e barbeiros usa RPCs SECURITY DEFINER com validação do tenant e exige a lista completa dos IDs da loja. A alteração de sort_order ocorre numa única operação de banco, rejeitando payload incompleto, duplicado ou de outro tenant.

A actualização de horários usa replace_working_hours. A base usa sete linhas; um override usa zero ou sete. A operação substitui o conjunto numa única transacção, rejeitando duplicados, dias inválidos e intervalos com fecho anterior ou igual à abertura.

## Phase 4: Availability Engine 2.0

A tabela `schedule_overrides` representa excepções por data a nível da loja ou do barbeiro. Uma excepção pode fechar o dia ou definir um novo intervalo de abertura e fecho. A precedência é: override do barbeiro, override da loja, horário específico do barbeiro, horário base da loja.

O motor de slots recusa datas passadas, respeita `max_advance_days` em data e em timestamp, aplica `min_lead_time_min`, usa a duração efectiva do serviço e o `slot_interval_min`, ignora `pending` cuja hold já expirou, e bloqueia `confirmed`, `in_progress` e holds pendentes ainda válidos. `time_blocks` são barreiras adicionais por loja ou barbeiro.

O acesso público recebe apenas a função de disponibilidade. A tabela `schedule_overrides` não é exposta ao cliente anónimo. Alterações de calendário usam `save_schedule_override` e `delete_schedule_override`, restritos a owner/manager.

O contrato de consumo React está em `frontend/src/features/availability/api.ts`.

## Phase 5: Booking Engine 2.0

`book_appointment` é o limite transaccional para criação de marcações online. A função valida e resolve as entidades dentro do tenant, adquire `pg_advisory_xact_lock`, reconsulta `get_available_slots`, faz upsert do cliente, calcula o sinal, insere a marcação, enfileira notificações e cria o audit log na mesma unidade de trabalho.

A tabela `appointments` continua sem INSERT directo para anon/authenticated. O conflito de concorrência é traduzido para `SLOT_TAKEN`, mantendo a exclusion constraint `appointments_no_overlap` como última barreira.

Os tipos e o consumidor React estão em `frontend/src/features/booking/api.ts`. A suíte em `supabase/tests/booking_phase5.sql` usa apenas blocos rollback-only.

## Phase 6: appointment token management

A public capability token is backed by `appointments.manage_token`. The token RPCs expose only customer-safe fields, cancellation/rescheduling flags and slot starts. Anonymous direct SELECT on `appointments` is revoked; public reads and mutations use SECURITY DEFINER functions with `search_path=""`.

Rescheduling uses the same availability engine and the same barber advisory lock as booking. Cancellation also acquires that lock before changing the appointment state, preventing stale reminder work and reducing race windows with new bookings.
