# BarberOS by Oryon
## Fase 0: Baseline e congelamento

Data de referência: 2026-09-18
Fuso de referência: Africa/Maputo

## Regra de segurança desta fase

Esta fase não executou nenhuma migration, reset, delete, recreate, seed adicional ou alteração de configuração no Supabase de produção.

Nenhuma alteração foi feita em `main`.

A baseline foi criada numa branch isolada:

`phase-0/baseline-20260918`

Base exacta da branch:

`8b454f78030dcb2506a05600d94b27cdbb6e378a`

## GitHub

Repositório oficial:
`edmundokutuzov333/BarberOS`

Branch principal:
`main`

HEAD observado:
`8b454f78030dcb2506a05600d94b27cdbb6e378a`

Mensagem do commit:
`BarberOs by Oryon`

Estado de CI observado no commit:
Vercel = success.

Branch pré-existente `phase-1/security-hardening`:
idêntica a `main`, sem commits adicionais, no momento da auditoria.

## Supabase

Project ref:
`alseiinjzwjdiwtvkdzy`

Nome:
`BarberOS`

Estado:
`ACTIVE_HEALTHY`

Região:
`eu-west-2`

PostgreSQL:
17.6.1.166

PostgreSQL engine:
17

## Snapshot de dados

| Objecto | Registos |
|---|---:|
| profiles | 3 |
| plans | 3 |
| barbershops | 2 |
| barbershop_members | 2 |
| barbers | 1 |
| services | 2 |
| barber_services | 1 |
| haircuts | 44 |
| working_hours | 14 |
| time_blocks | 0 |
| customers | 1 |
| appointments | 1 |
| waitlist_entries | 0 |
| reviews | 0 |
| payments | 0 |
| notifications | 2 |
| audit_logs | 1 |

Barbearias observadas:
- `oryon` | activa | timezone Africa/Maputo
- `magoanine-c` | trial | timezone Africa/Maputo

Os dados de QA existentes foram preservados. Não foram apagados nesta fase.

## Schema

17 tabelas públicas do domínio estão presentes e com RLS activado.

Core preservado:
- appointments
- customers
- services
- haircuts
- barbers
- barber_services
- working_hours
- time_blocks
- waitlist_entries
- reviews
- payments
- notifications
- audit_logs
- barbershops
- barbershop_members
- profiles
- plans

Constraint crítica observada:

`appointments_no_overlap`

Definição efectiva:
exclusion constraint GiST por `barber_id` e intervalo `tstzrange(starts_at, ends_at, '[)')`, apenas para estados `pending`, `confirmed` e `in_progress`.

Triggers públicos observados:
- `appointments_completed` em UPDATE de `appointments`

## Functions

O catálogo PostgreSQL contém muitas funções de sistema/extensão. Entre as funções de domínio observadas estão:

- `create_barbershop`
- `add_member_by_email`
- `book_appointment`
- `get_available_days`
- `get_available_slots`
- `enqueue_appointment_notifications`
- `list_members`
- `seed_haircut_catalogue`
- `is_member`
- `is_platform_admin`
- `my_barber_id`
- `shop_is_public`
- `handle_new_user`
- `on_appointment_completed`

Foram observadas 14 funções SECURITY DEFINER expostas por ACL para o role anon/authenticated. Isto não foi alterado na Fase 0 porque a correcção pertence à Fase 1 e requer validação funcional antes de qualquer revoke.

## Storage

Buckets públicos existentes:

- `shop-logos`
- `shop-photos`
- `barbers`
- `haircuts`

Policies de storage observadas:
- `storage_public_read`
- `storage_member_write`

## Realtime

No momento da baseline:
nenhuma tabela do domínio está publicada em `supabase_realtime`.

Isto é uma lacuna conhecida para a futura Fase de operação realtime.

## Cron

O schema `cron` não está presente no estado observado.

Nenhum Edge Function existe no projecto no momento da baseline.

## Migration drift

GitHub contém:
- `supabase/migrations/0001_schema.sql`
- `supabase/migrations/0002_rls.sql`
- `supabase/migrations/0003_engine.sql`

Supabase:
- `list_migrations` devolveu zero migrations
- o schema `supabase_migrations.schema_migrations` não foi observado

Conclusão:
o banco possui o schema funcional, mas a ferramenta de migrations não possui histórico correspondente. Isto é DRIFT / UNVERIFIED e não será resolvido por reaplicação cega.

## Security advisors observados

O advisor de segurança sinalizou:
- extensão `btree_gist` no schema `public`
- 14 funções SECURITY DEFINER executáveis por anon
- 14 funções SECURITY DEFINER executáveis por authenticated
- leaked password protection do Supabase Auth desactivada

O advisor de performance sinalizou 28 foreign keys sem índice de cobertura.

Estes pontos ficam registados para a fase de hardening. Não foram modificados nesta baseline.

## Functional baseline

Já existem no frontend oficial:
- autenticação
- onboarding
- serviços
- cortes
- barbeiros
- horários
- bloqueios
- definições
- QR Code
- poster A5
- dashboard
- administração inicial

Ainda não estão implementados no frontend oficial:
- página pública da barbearia
- booking wizard
- gestão de marcação por token
- agenda
- tabela operacional de marcações
- CRM
- waitlist
- dispatcher de notificações
- cron
- realtime
- reviews flow
- pagamentos
- relatórios
- administração completa

## Auxiliary repository baseline

O repositório auxiliar `edmundokutuzov333/barberflow-pro` foi mantido apenas como referência arquitectural.

HEAD observado:
`d6080f42fcfc9243ce7684b0ebda1a6f09f831be`

Não é fonte de verdade do domínio.

Elementos a considerar futuramente:
- separação client/server
- middleware CSRF
- tratamento de erros SSR
- ambiente Supabase com publishable key
- organização por features
- tipagem gerada do Supabase

Elementos que não serão adoptados cegamente:
- permissões RLS mais permissivas
- criação de barbearia por insert directo
- auto-membership permissivo
- Drizzle como fonte primária do schema
- migração integral para TanStack Start
- migração integral para Tailwind 4

## Estado final da Fase 0

STATUS: BASELINE CONGELADA

Produção Supabase alterada: NÃO

`main` alterado: NÃO

Branch de baseline criada: SIM

Inventário físico do Supabase: SIM

Inventário GitHub: SIM

Migration drift identificado: SIM

Security drift identificado: SIM

Realtime identificado como ausente: SIM

Cron identificado como ausente: SIM

Dados existentes preservados: SIM
