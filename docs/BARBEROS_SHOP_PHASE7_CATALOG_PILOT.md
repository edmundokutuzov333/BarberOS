# BarberOS | Fase 7: catálogo de referência e preparação do piloto

**Estado técnico:** fluxo de validação do catálogo implementado em código.  
**Estado operacional:** piloto real ainda não certificado. A aprovação na aplicação não substitui a inspecção física dos artigos nem a formação da equipa.  
**Regra de segurança:** não são inseridos produtos, SKUs, preços ou imagens de demonstração em tenants reais.

## Especificação aplicada

A especificação de produto, páginas 12 a 14, 20 a 23 e 25 a 27, exige publicar apenas artigos e SKUs confirmados pela barbearia, imagens com origem e permissão registadas, um responsável, formação da recepção/barbeiro e um teste operacional diário. O sucesso requer pedidos reais cumpridos e conciliados, não um catálogo preenchido.

A área `/app/loja/piloto` permite ao proprietário/gestor consultar o estado real do catálogo, identificar artigos publicados sem fotografia/proveniência aprovadas, sem variantes ou sem stock, e registar uma nota auditável da verificação física. O processo confirma marca, variante/SKU ou descrição genérica, preço, stock e origem/permissão da imagem. Não altera a flag pública da Loja.

A validação exige fotografia, texto alternativo e proveniência/autorização registada pelo PostgreSQL, uma variante activa e stock positivo quando o artigo controla stock. A publicação de artigos novos ou alterados exige validação; alterações relevantes de produto ou variantes invalidam a aprovação e retiram o produto de publicação para nova revisão. Um SKU exacto pode ficar por confirmar quando a descrição genérica é explicitamente validada, conforme a página 25 do PDF.

A Fase 6 também foi corrigida: reconhecer alertas usa a RPC `mark_shop_notification_read`, com autorização por tenant e comportamento idempotente. O papel `authenticated` deixa de ter escrita directa na tabela de alertas. Foram acrescentados índices individuais para as FKs.

## Protocolo de curadoria

1. Inspeccionar fisicamente o artigo e confirmar marca, formato, SKU quando exista, preço actual em MT, stock real e regra de consumo local/para levar.
2. Usar fotografia própria ou imagem com permissão confirmada. Registar texto alternativo, origem quando aplicável e nota de autorização. Uma URL pública não prova licença.
3. Criar o produto e a variante no painel Loja; usar movimentos de stock para registar o saldo inicial. Não presumir disponibilidade do catálogo de referência.
4. Um responsável confirma a verificação física no painel do piloto. Uma descrição genérica é permitida quando o SKU não está confirmado; não atribuir a imagem de outra embalagem.
5. Executar em staging o fluxo com conta autorizada: marcação sem produtos, com um produto e com vários, indisponibilidade, erro/retry e fila de preparação. Reconciliar pedido, quantidade entregue, movimento de stock e pagamento registado.

A simulação transaccional automatizada `supabase/tests/shop_phase7_pilot_day.sql` cobre, numa única transacção revertida, verificação de catálogo, atribuição, aceitação, preparação, estado pronto, entrega idempotente, consumo de reserva, movimento de stock, alertas e relatório diário. Confirma também que a entrega não é classificada como receita paga. Esta prova técnica não substitui a execução com operadores humanos.
6. Formar recepção e barbeiro para receber, aceitar, preparar, pronto, parcial, entregue, cancelado, falta de stock, no-show e incidentes. Não enviar PII para analytics.
7. Só considerar GO após aceite operacional escrito, ausência de falhas críticas, CI verde, schema/migrations reconciliados, deployment correcto, anti-bot confirmado e rollback testado.

## Evidência dos ambientes, actualizada em 26 de Outubro de 2026

- **Staging** `asikuyxaapcmayptimxi`: as migrations da Fase 6 e da Fase 7 foram aplicadas pela ferramenta Supabase. O histórico remoto regista `shop_communications_reporting_phase6` como versão `20261026085339` e `shop_catalog_reference_pilot_phase7` como versão `20261026085350`. A tabela de eventos, campos de verificação e RPCs estão presentes. O domínio das Fases 1 a 5 já existia.
- A barbearia existente no staging mantém `shop_enabled=false`. Depois dos testes, o staging contém zero produtos e zero pedidos. Os testes de domínio/catálogo/pedidos usaram fixtures isoladas dentro de transacções e fizeram rollback.
- Foram executados no staging os contratos SQL `shop_domain_phase1.sql`, `shop_catalog_phase2.sql`, `shop_catalog_rules_phase2.sql`, `shop_public_catalog_phase3.sql`, `shop_order_atomic_phase4.sql`, `shop_order_operations_phase5.sql`, `shop_catalog_phase7.sql` e o contrato de integração da Fase 6. Nenhum erro SQL foi devolvido; as condições de aprovação são verificadas por excepções no interior dos testes.
- A reconciliação global do histórico **não está concluída**: versões remotas antigas não coincidem em vários casos com os prefixos de tempo dos ficheiros no repositório; as duas migrations aplicadas nesta execução receberam versões remotas geradas pela ferramenta que não coincidem com os prefixos `20261026150000` e `20261026160000`. Não executar `db push` nem tentar reparar o histórico em lote até existir um mapa aprovado de migrações/esquema.
- **Produção** `alseiinjzwjdiwtvkdzy`: permanece inalterada e não contém `shop_products`, `appointment_product_orders`, `shop_notification_events` nem `barbershops.shop_enabled`. A Loja continua desligada e não está disponível para clientes.
- Não foram persistidos preços, SKUs, fotografias, stock, pedidos ou pagamentos fictícios. Os registos de QA foram revertidos; os testes de stock e entrega usam fixtures que não contam como vendas reais.
- A aceitação humana ainda não ocorreu: nenhum staff foi treinado e não houve um dia operacional presencial. As barbearias são tenants fictícios de teste, mas isso não permite afirmar que imagens, SKUs, preços ou direitos físicos de produtos foram verificados no mundo real. O piloto permanece **NO-GO** até a equipa concluir esse ensaio e registar aceitação.

## Critério de saída

A preparação técnica passa quando os artigos só podem ser publicados após verificação, a proveniência de imagem e o responsável ficam registados e alterações invalidam aprovações antigas. O piloto só passa depois de uma barbearia real concluir um dia de teste e reconciliar pedidos, entregas e stock. A flag pública permanece desligada por defeito.


## Defeito operacional encontrado e corrigido em 26 de Outubro de 2026

O ensaio ponta a ponta encontrou um defeito na RPC `get_shop_order_payment_queue`: um pedido parcialmente entregue não tem necessariamente `delivered_at`, pelo que um pedido recente, liquidado sobre os artigos já entregues, podia desaparecer da fila. A migration forward-only `20261026180000_shop_payment_queue_partial_delivery_fix.sql` usa `coalesce(delivered_at, updated_at)` para ordenar e manter visíveis os pedidos recentes sem inventar o timestamp de entrega total.

O teste `supabase/tests/shop_order_payments_phase8.sql` deixa agora `delivered_at` nulo no cenário de entrega parcial. Isto reproduz o estado real da máquina de estados e impede que o defeito volte a ficar oculto no teste.
