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
6. Formar recepção e barbeiro para receber, aceitar, preparar, pronto, parcial, entregue, cancelado, falta de stock, no-show e incidentes. Não enviar PII para analytics.
7. Só considerar GO após aceite operacional escrito, ausência de falhas críticas, CI verde, schema/migrations reconciliados, deployment correcto, anti-bot confirmado e rollback testado.

## Evidência dos ambientes em 26 de Outubro de 2026

- **Produção** `alseiinjzwjdiwtvkdzy`: não contém `shop_products`, `appointment_product_orders`, `shop_notification_events` nem a coluna `barbershops.shop_enabled`. Não é possível validar nem activar a Loja.
- **Staging** `asikuyxaapcmayptimxi`: contém o domínio das Fases 1 a 5 e a coluna `shop_enabled`; zero barbearias têm a flag ligada. A tabela de notificações da Fase 6 ainda não estava aplicada na consulta.
- O histórico remoto de migrations de staging apresenta versões cujo timestamp não coincide com os ficheiros versionados actuais. As migrations remotas das Fases 6/7 ficaram por aplicar até à reconciliação individual. Não foi executado `db push`, reparação em lote, nem alteração de produção.
- Nenhuma marca, preço, SKU, fotografia ou stock foi inventado ou inserido como catálogo real.
- Não foi seleccionada uma barbearia real nem foi possível formar pessoal remotamente. São dependências operacionais que não podem ser dadas como concluídas por uma migration.

## Critério de saída

A preparação técnica passa quando os artigos só podem ser publicados após verificação, a proveniência de imagem e o responsável ficam registados e alterações invalidam aprovações antigas. O piloto só passa depois de uma barbearia real concluir um dia de teste e reconciliar pedidos, entregas e stock. A flag pública permanece desligada por defeito.
