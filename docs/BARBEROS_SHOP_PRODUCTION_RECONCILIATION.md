# BarberOS: auditoria de reconciliação de produção da Loja

Data da verificação: 23 de Outubro de 2026. Repositório: `edmundokutuzov333/BarberOS`, branch `main`. As consultas feitas à produção e ao staging foram somente de leitura.

## Evidência confirmada

| Verificação | Produção `alseiinjzwjdiwtvkdzy` | Staging `asikuyxaapcmayptimxi` |
|---|---|---|
| Registos em `supabase_migrations.schema_migrations` | 110 | 97 |
| Ficheiros SQL em `main` | 134 no repositório | 134 no repositório |
| Migrations a partir de `20261023000000` | 0 | 22 |
| `barbershops.shop_enabled` | ausente | presente |
| Tabelas de catálogo, variantes, pedidos e reservas | ausentes | presentes |
| RPC `get_public_shop_catalog(text)` | ausente | presente |
| RPC `book_appointment_with_shop_order_idempotent` | ausente | presente |
| `booking-create` | versão 1 | versão 5 |

O staging contém `shop_product_categories`, `shop_products`, `shop_product_variants`, `appointment_product_orders`, `appointment_product_order_items`, `inventory_movements`, `inventory_reservations`, `shop_catalog_audit_events` e `booking_idempotency`. A produção não contém estes objectos nem o contrato de criação de marcação e pedido atómico.

Os históricos não são intercambiáveis. Algumas versões registadas na produção têm timestamps diferentes dos prefixos dos ficheiros SQL actuais; o staging também regista um conjunto base com versões remapeadas. Há ainda objectos presentes na produção e ausentes no staging, incluindo `support_tickets`, `platform_access_events`, `gmail_connections`, `gmail_oauth_states` e `_theme_key_backup_20261020`. Estes dados e objectos devem ser preservados.

Na Vercel, o projecto `barber-os` não lista `VITE_SHOP_PUBLIC_CATALOG_ENABLED`, `VITE_TURNSTILE_SITE_KEY` nem `VITE_BOOKING_TURNSTILE_REQUIRED`. Sem a variável global da Loja, o wizard conserva o percurso actual e não consulta a RPC pública da Loja. A versão de `booking-create` em produção não corresponde ao código actual, que exige o novo contrato da base de dados e a validação de Turnstile. Não se expuseram valores de segredos.

## O que não foi executado

Não foram aplicadas migrations à produção, nem executado `supabase db push`, `migration repair`, actualização de `schema_migrations`, deploy de Edge Functions ou activação de feature flags. A reconciliação só por nome ou timestamp poderia fazer o CLI repetir DDL já aplicado ou ignorar objectos não equivalentes; os controlos de lançamento existentes não foram contornados.

## Plano seguro de reconciliação forward-only

1. Inventariar produção: schemas, extensões, tabelas, colunas, tipos, índices, constraints, triggers, funções, grants, RLS/policies e versões instaladas. Comparar também as arrays de statements do histórico remoto com os ficheiros de `main`. Não inferir equivalência só pelo nome.
2. Produzir um mapa explícito `versão/name remoto → migration SQL equivalente`, evidenciado por comparação de statements e objectos finais. Quando não houver equivalência demonstrada, manter o caso aberto. Não marcar uma migration como aplicada apenas para fazer o CLI avançar.
3. Restaurar uma cópia isolada do schema de produção em staging dedicado e simular o release e rollback. Preservar os objectos adicionais da produção. Validar o token gateway antes das revogações de EXECUTE, conforme o workflow existente.
4. Aplicar migrations aditivas da Loja só depois de os pré-requisitos e o mapa de versões terem sido aprovados; verificar o schema novamente e executar contratos das Fases 1 a 4, incluindo a corrida de duas sessões e cancelamento/libertação de reservas.
5. Confirmar os segredos obrigatórios do workflow protegido, Turnstile nos domínios correctos e os quatro segredos de aceitação browser dedicada. Fazer deploy da Edge Function actualizada só depois do schema. Validar health check e percursos enquanto ambas as flags da Loja continuam desligadas.
6. Só depois de uma barbearia piloto validar SKU, imagem autorizada, preços, variantes e stock, activar primeiro a flag do tenant e depois o gate global. Confirmar o fluxo publicado antes de alargar o rollout.

## Estado

**NO-GO para produção.** O código da Fase 4 e os contratos transaccionais passam no CI local de `main`, mas produção ainda não tem o schema, as funções nem a versão de Edge Function necessários. A aceitação browser completa continua ignorada quando faltam credenciais dedicadas. Este relatório não altera nem substitui o histórico real do Supabase.
