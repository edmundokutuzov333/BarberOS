# BarberOS Supabase

Este directório contém o contrato backend do BarberOS: migrations ordenadas, testes SQL, Edge Functions e configuração do projecto Supabase.

A arquitectura, os fluxos de domínio, a configuração local e a política de release estão documentados no [README principal](../README.md).

## Estrutura

| Caminho | Responsabilidade |
|---|---|
| `migrations/` | Histórico canónico do schema, RLS, grants, constraints, índices, funções e triggers |
| `tests/` | Contratos pgTAP, testes read-only e suites de acceptance específicas de domínio |
| `functions/` | Fronteiras HTTP, gateway de tokens, booking, payments, notificações, health e integrações |
| `config.toml` | Project ref e configurações das Edge Functions |

## Regras de migration

1. Nunca renomear nem reordenar uma migration já aplicada.
2. Cada mudança de schema deve entrar numa nova migration timestamped.
3. Validar a cadeia completa num ambiente local vazio.
4. Confirmar o histórico remoto/local e as diferenças semânticas antes de produção.
5. Regenerar os tipos frontend quando o contrato de schema mudar.
6. Não usar `supabase db reset --linked`, replay cego ou scripts mutáveis contra produção.

## Segurança

PostgreSQL é a fonte de verdade do domínio. RLS, grants explícitos, funções privilegiadas e constraints são parte do contrato. Não conceder DML directo de browser em tabelas de domínio para contornar uma RPC em falta.

Os secrets usados por Edge Functions ficam na configuração server-side. Nunca os guardar neste directório nem expô-los por variáveis `VITE_*`.

## Testes

Os testes pgTAP compatíveis podem correr na base local criada pelo workflow de CI. As suites comportamentais que precisam de lojas, clientes, marcações, pagamentos ou actores reais requerem uma base de teste dedicada e as variáveis explícitas definidas pelos runners. A ausência dessas variáveis deve continuar a bloquear a certificação.

## Release

A publicação Supabase é manual e está protegida por aprovação, reconciliação do histórico, configuração de segurança e verificação de staging. Consultar:

- `../docs/DATABASE.md`
- `../docs/SECURITY.md`
- `../docs/PRODUCTION_RELEASE_SAFETY.md`
- `../docs/BOOKING_SECURITY_RELEASE.md`
- `../.github/workflows/deploy-supabase.yml`
