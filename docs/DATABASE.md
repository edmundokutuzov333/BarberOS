# BarberOS Database

## Fonte de verdade

O PostgreSQL do projecto Supabase é a fonte de verdade do domínio.

A pasta `supabase/migrations` é a representação reproduzível dessa base. A aplicação não cria tabelas, enums ou funções de domínio em runtime.

A ordem actual é:

1. `20260918132000_initial_schema.sql`
2. `20260918132200_rls.sql`
3. `20260918132400_engine.sql`
4. `20260918132513_security_hardening.sql`

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

- 17 tabelas no schema public
- 13 enums do domínio
- 28 índices no schema public
- 69 constraints no schema public
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
