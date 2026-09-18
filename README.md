# BarberOS by Oryon

BarberOS é um SaaS multi-tenant para operação de barbearias, com marcação pública sem conta e gestão interna por equipa.

## Arquitectura

React + Vite
Supabase JS
PostgreSQL + RLS + RPC
Supabase Auth
Supabase Storage
Supabase Realtime
Supabase Edge Functions

O PostgreSQL é a fonte de verdade para o domínio e para a lógica crítica.

## Repositório

- `frontend/`: aplicação React
- `supabase/migrations/`: histórico canónico da base de dados
- `supabase/tests/`: testes de aceitação de base de dados
- `supabase/functions/`: fronteira para integrações server-side
- `supabase/seed/`: referência/configuração determinística sem dados falsos
- `scripts/`: tooling local com guardas explícitas

## Migrations

A cadeia actual é:

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
22. `20260918143918_appointment_token_cancel_lock_order.sql`
23. `20260918144319_public_barbershop_surface.sql`
24. `20260918144500_appointment_token_cancel_returning_fix.sql`
25. `20260918144535_public_barbershop_anon_boundary.sql`
26. `20260918145140_public_booking_config.sql`
27. `20260918145210_public_booking_deposit_config.sql`

Future schema changes must be a new timestamped migration. Never rename an applied migration.

A base viva foi reconciliada com esta cadeia sem reset, delete ou replay cego.

## Frontend database contract

O ficheiro `frontend/src/lib/database.types.ts` é gerado a partir do PostgreSQL vivo.

O cliente Supabase usa `createClient<Database>`, e os tipos de domínio derivam do mesmo contrato.

## Ambiente

Copie os templates:

- `.env.example`
- `frontend/.env.example`
- `backend/.env.example`

Nunca coloque secrets reais em Git.

## Segurança

Consulte `docs/SECURITY.md`.

## Base de dados

Consulte `docs/DATABASE.md`.

O teste read-only de baseline está em:

`supabase/tests/migration_phase2.sql`

## Regra operacional

Não usar bases de produção para testes mutáveis.

Não usar scripts SQL ad-hoc para modificar produção.

As mudanças de schema entram através de migrations.

## Fase 3: integridade do domínio

A base PostgreSQL impõe invariantes para horários, limites de domínio e relações entre entidades do mesmo tenant. Reordenação e grelha de horários são persistidas por RPCs transaccionais e tipadas no frontend.

A configuração de barbeiros usa o RPC transaccional save_barber para evitar estados parciais entre o barbeiro e os seus serviços.

## Fase 4: Availability Engine 2.0

A disponibilidade é calculada no PostgreSQL e consumida pelo frontend através de RPCs tipadas. O motor considera timezone da loja, duração do serviço, barbeiro e associação ao serviço, horário semanal, override por barbeiro, dias especiais por data, lead time, janela máxima, marcações activas e bloqueios.

Dias especiais suportam fecho completo ou horário especial e têm precedência sobre o horário semanal. Overrides específicos do barbeiro têm precedência sobre overrides da loja.

O browser não implementa uma segunda regra de disponibilidade. `frontend/src/features/availability/api.ts` fornece o contrato de consumo para o booking público.

## Fase 5: Booking Engine 2.0

A criação de marcações online vive no PostgreSQL através de `book_appointment`. O fluxo valida tenant, serviço, corte, barbeiro, horário e disponibilidade; usa advisory lock transaccional; faz customer upsert; calcula sinal quando aplicável; cria a marcação; enfileira notificações e regista audit log.

A concorrência usa `SLOT_TAKEN` como contrato de negócio e mantém `appointments_no_overlap` como barreira final. O frontend consome este contrato através de `frontend/src/features/booking/api.ts`, sem INSERT directo em `appointments`.

## Fase 6: gestão da marcação por token

A rota `/marcacao/:token` permite ao cliente consultar a marcação sem conta, cancelar ou remarcar dentro da política da barbearia, adicionar o evento ao calendário e contactar a loja por WhatsApp. O frontend usa apenas os RPCs públicos da feature de appointments; IDs internos não fazem parte do DTO público.

## Fase 7: área pública da barbearia

A rota `/barbearia/:slug` agora é uma superfície pública real ligada ao Supabase. O frontend consulta o RPC `get_public_barbershop`, que devolve apenas dados de publicação do tenant: perfil, serviços activos, cortes activos, barbeiros activos, horário semanal e avaliações publicadas.

O acesso anónimo directo às tabelas do domínio foi fechado para a superfície pública. A publicação é servida por RPC SECURITY DEFINER com `search_path=""`.

A implementação está em `frontend/src/features/public-shop/api.ts` e `frontend/src/pages/PublicBarbershop.tsx`. A aceitação live está em `supabase/tests/public_barbershop_phase7.sql`.

## Fase 8: booking wizard público

A rota `/barbearia/:slug/marcar` implementa o percurso sem conta em seis passos: serviço, corte, barbeiro, data, hora e dados. O estado das escolhas operacionais fica em `searchParams`; dados pessoais não são colocados na URL.

Dias e slots vêm do Availability Engine e a criação usa exclusivamente `book_appointment()`. "Qualquer barbeiro" é resolvido pelo PostgreSQL. Em caso de `SLOT_TAKEN`, o cliente regressa ao passo de hora e a disponibilidade é actualizada.

A implementação está em `frontend/src/pages/BookingWizard.tsx`. A aceitação live está em `supabase/tests/booking_wizard_phase8.sql`.
