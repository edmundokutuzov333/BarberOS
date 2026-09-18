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
