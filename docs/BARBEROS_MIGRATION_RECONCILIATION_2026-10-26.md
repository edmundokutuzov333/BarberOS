# BarberOS: reconciliação de migrations, schema e certificação da Loja

**Data do snapshot:** 26 de Outubro de 2026  
**Repository baseline:** `e1dde726f29e592fd4d31bc4bc5a0810a1c67c4c`  
**Staging:** `asikuyxaapcmayptimxi`  
**Produção:** `alseiinjzwjdiwtvkdzy`

## Resultado verificado

A reconciliação funcional necessária à Loja da Barbearia foi executada nos dois ambientes. O schema da Loja, as RPCs de pedido transaccional, operações, reporting, catálogo verificado e ledger de pagamentos existem em staging e produção. A flag permanece desligada em todas as barbearias. Os testes de aceitação usam transacções revertidas e não deixaram catálogo, pedidos, pagamentos, movimentos de stock ou alertas persistidos.

O histórico remoto não foi reescrito nem limpo. Os registos históricos têm timestamps e nomes de aplicação que, em alguns casos, diferem dos prefixos de ficheiro de `main`. O histórico exacto de toda a plataforma não é byte-a-byte igual ao conjunto de ficheiros de `main`; este relatório identifica aliases conhecidos e separa isso da compatibilidade funcional demonstrada.

## Migrations e acções aplicadas

### Pré-requisitos de marcação e segurança

- `booking_rpc_idempotency_and_lockdown`
- `booking_rate_limit_primitives`
- `availability_week_batch_reconcile`
- `public_foreign_key_covering_indexes`
- `token_rpc_lockdown_reconciliation`

As verificações confirmaram `booking_idempotency`, `private.rate_limits`, `book_appointment_idempotent`, `get_available_slots_week` e as RPCs por token com execução apenas de `service_role`.

### Loja da Barbearia

Foram instaladas as migrations versionadas das Fases 1 a 7: domínio e constraints; permissões/RLS; catálogo e publicação; pedido atómico ligado à marcação; reservas de stock; operações e transições; alertas internos; reporting; verificação do catálogo; e ledger de pagamentos.

Foi identificada e corrigida uma falha de reporting na entrega parcial. Um pedido parcialmente entregue pode ter `delivered_at IS NULL`; a fila usa agora `coalesce(delivered_at, updated_at)` para manter visíveis as entregas parciais recentes. O teste de regressão mantém explicitamente `delivered_at` nulo.

### Outras reconciliações seguras

- `resend_webhook_event_tracking` está registada em produção e staging. Em staging, a tabela já existia antes do registo canónico; foi aplicada uma variante idempotente para confirmar a mesma definição sem apagar dados.
- `waitlist_expire_status_persistence` está aplicada em ambos os ambientes e a RPC persiste/retorna o estado `expired`.
- Foi acrescentada a migration `20261026190000_resend_email_event_fk_index.sql` para indexar `resend_email_events.notification_id`, a única FK sem índice que a auditoria encontrou na produção após a instalação do ledger.

## Validação de schema e dados

Snapshot validado após as reconciliações das Fases 1 a 7:

| Verificação | Staging | Produção |
|---|---:|---:|
| Barbearias existentes | 1 | 4 |
| Barbearias com `shop_enabled=true` | 0 | 0 |
| Produtos de loja persistidos | 0 | 0 |
| Pedidos de produtos persistidos | 0 | 0 |
| Pagamentos de loja persistidos | 0 | 0 |
| Movimentos de stock persistidos | 0 | 0 |
| Alertas de loja persistidos | 0 | 0 |

RPCs verificadas incluem `book_appointment_with_shop_order_idempotent`, `get_shop_phase7_catalog_readiness`, `verify_shop_catalog_product`, `get_shop_order_queue`, `get_shop_order_payment_queue`, `record_shop_order_payment`, `get_shop_phase6_report` e `mark_shop_notification_read`.

A auditoria de cobertura de FKs da Loja devolveu zero referências sem índice em staging e produção. Na produção, a auditoria mais ampla detectou inicialmente uma FK sem índice, `resend_email_events.notification_id`; a migration de índice acima fecha esse caso. Os testes não deixaram dados fictícios persistidos.

## Testes executados

Em staging e produção foram executados com transacção revertida:

1. `supabase/tests/shop_domain_phase1.sql`
2. `supabase/tests/shop_catalog_phase2.sql`
3. `supabase/tests/shop_catalog_rules_phase2.sql`
4. `supabase/tests/shop_public_catalog_phase3.sql`
5. `supabase/tests/shop_order_atomic_phase4.sql`
6. `supabase/tests/shop_order_operations_phase5.sql`
7. `supabase/tests/shop_catalog_phase7.sql`
8. `supabase/tests/shop_phase7_pilot_day.sql`
9. `supabase/tests/shop_order_payments_phase8.sql`

Todos terminaram sem erro reportado. Cobrem isolamento tenant, publicação/verificação, criação de pedido, transições, entrega parcial, movimento de stock, idempotência de pagamentos, rejeição de sobrepagamento e reconciliação de reporting. A suite GitHub Actions associada à versão `e1dde726f29e592fd4d31bc4bc5a0810a1c67c4c` também tem verificação, Phase 23, frontend, contrato de deployment e deployment Vercel aprovados. Os gates Phase 24 de concorrência e Phase 25 de desempenho estavam em execução quando este snapshot foi preparado; confirmar o resultado do novo commit antes de declarar todos os workflows finais.

## Edge Functions em produção

- `booking-create` está activa na versão 3, sincronizada com a implementação sem CAPTCHA de `main`; conserva rate limiting, allowlist de origens e idempotência.
- `token-gateway` está activa na versão 3, sincronizada com `main`, e inclui a acção `shop_order.get`.
- As RPCs de gestão por token não são executáveis por `anon` ou `authenticated`; `service_role` mantém a permissão necessária ao gateway.

Os deployments foram confirmados como `ACTIVE` pela API de gestão Supabase. Não foi possível executar um POST HTTP real ao gateway através das ferramentas disponíveis nesta sessão; a versão/estado publicado e os contratos SQL foram verificados, mas o smoke HTTP da função não deve ser rotulado como executado.

## O que ainda não significa “piloto operacional concluído”

As barbearias existentes são tenants de teste conforme o contexto desta tarefa, mas o registo de treino exige pessoas a executar a interface. A simulação `shop_phase7_pilot_day.sql` é um teste técnico, não é prova de formação de recepção/barbeiro nem de aceitação humana. O runbook está em `docs/BARBEROS_SHOP_PHASE7_PILOT_RUNBOOK.md`; preencher a checklist só depois das tarefas serem executadas e documentadas. Não foram inventados nomes, assinaturas, SKUs, preços ou direitos de imagem.

A Loja permanece desligada até essa aceitação. Não se activou nenhum tenant.

## Aliases e diferenças históricas preservadas

A listagem de migrations não deve ser interpretada apenas por igualdade exacta entre o prefixo temporal do ficheiro e o campo remoto `version`. Aplicações efectuadas por tooling podem gerar uma versão temporal nova, e nomes de registos históricos podem conter o prefixo dentro do próprio `name`. Exemplos identificados:

- `20261026110000_shop_order_operations_phase5` está registada com o timestamp no nome em ambos os ambientes; não reexecutar a migration de Fase 5 depois das migrations de hardening, pois isso poderia repor funções antigas.
- `20261023133806_20261023134000_shop_order_reservation_release_phase4.sql` aparece sob o nome lógico `20261023134000_shop_order_reservation_release_phase4` na produção e com um timestamp de execução diferente em staging.
- Staging conserva registos `reconcile_shop_phase6_schema_drift`, `reconcile_shop_phase7_schema_drift`, `reconcile_shop_payment_reporting_phase7` e `reconcile_shop_payment_queue_partial_delivery_fix_v2`; foram mantidos, não apagados.
- `availability_week_batch` é substituída na linha activa por `availability_week_batch_reconcile`; a RPC semanal foi verificada.
- `token_rpc_lockdown` foi reconciliada por `token_rpc_lockdown_reconciliation`; os privilégios resultantes foram verificados.

Continuam a existir diferenças de nomes/registos para migrations antigas de domínios fora da Loja, incluindo fundações da plataforma, alguns patches de permissões e aliases históricos de telefone/pagamentos. Essas migrations antigas contêm `create or replace function` e não devem ser aplicadas cegamente depois de patches mais recentes, porque podem substituir comportamento actual. A equivalência total de todos esses domínios requer comparação funcional individual; o estado da Loja e dos seus pré-requisitos críticos foi validado separadamente. Não se fez `db reset`, alteração manual da tabela de histórico, nem remoção de dados de produção.


## Validação operacional complementar em 26 de Outubro

A suite completa `supabase/tests/waitlist_phase13.sql` foi executada em produção com rollback. Em staging, foi executada a mesma suite dentro de uma transacção com tenant, owner, serviço, barbeiro e horário de QA temporários, porque o staging não tinha uma barbearia elegível para servir de fixture; o teste passou e todos os dados temporários foram revertidos.

O contrato `supabase/tests/resend_webhook_contract.test.sql` usa pgTAP e não pode ser executado directamente nos projectos remotos consultados porque a extensão/função `plan(integer)` não está instalada nesses ambientes. Para não confundir essa limitação do runner com uma falha do ledger, foi executado em ambos um contrato SQL alternativo, dentro de transacção revertida: confirma RLS, bloqueio de acesso anon/authenticated, privilégio service_role e deduplicação idempotente de `provider_event_id`. Esse contrato passou em staging e produção. O teste pgTAP foi adicionado à suite de CI isolada em `scripts/test_database_phase23.py`.
