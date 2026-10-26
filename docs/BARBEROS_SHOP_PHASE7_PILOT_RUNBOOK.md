# BarberOS | Runbook de formação e dia de piloto da Loja

**Ambiente inicial:** staging `asikuyxaapcmayptimxi`  
**Feature flag:** desligada em todas as barbearias até aprovação explícita.  
**Natureza dos ensaios:** dados QA isolados e transaccionais; nunca contam como venda nem como formação humana concluída.

## Objectivo

Treinar proprietários/gestores, recepção e barbeiros no fluxo completo: produto verificado, marcação associada, pedido recebido, aceitação, preparação, entrega total/parcial, indisponibilidade, stock, pagamento confirmado pela equipa e reconciliação diária. O pedido, a entrega e o pagamento são estados diferentes.

## Roteiro de formação

### Proprietário ou gestor
1. Confirmar que a Loja está desactivada durante a preparação.
2. Criar categorias e produtos reais de teste no tenant de QA, definir preço em MT, tipo de consumo, variante e regra de stock.
3. Carregar fotografia própria autorizada ou activo com permissão comprovada; preencher texto alternativo e proveniência.
4. Registar stock inicial exclusivamente por movimentos, nunca por edição directa do saldo.
5. Validar fisicamente artigo/SKU, preço e stock no painel `/app/loja/piloto`; uma mudança de dados comerciais invalida a aprovação.
6. Rever a fila, o relatório de pedido/entrega e o ledger de pagamentos; confirmar que não existe receita até registo autorizado de recebimento.

### Recepção
1. Confirmar pedido, hora da marcação, quantidades, preferências e responsável.
2. Aceitar só o que consegue cumprir. Para indisponibilidade, registar motivo e obter decisão explícita do cliente antes de substituição.
3. Iniciar preparação e marcar pronto apenas quando todos os artigos aplicáveis estiverem preparados.
4. Em entrega parcial, registar apenas a quantidade entregue e a razão do restante. Nunca marcar quantidades não entregues como entregues.
5. Registar recebimento apenas depois de contar numerário ou confirmar o comprovativo/estado oficial do meio de pagamento. POS, M-Pesa, e-Mola e banco exigem referência; a referência inserida por um operador não prova reconciliação automática do provider.

### Barbeiro
1. Confirmar o pedido da visita e as preferências relevantes sem expor dados desnecessários.
2. Avisar a recepção quando o serviço ou horário mudar, ou quando um artigo não puder ser preparado.
3. Não alterar produtos, stock ou pagamento fora das permissões atribuídas.
4. Confirmar conclusão/entrega com a recepção e escalar divergências ou reclamações.

## Ensaio técnico automatizado

Executar em staging, sobre a base da aplicação e com feature flag pública desligada:

1. `supabase/tests/shop_catalog_phase7.sql`: aprovação, proveniência, publicação e invalidação.
2. `supabase/tests/shop_order_atomic_phase4.sql`: ligação transaccional, preço, stock, idempotência e rollback.
3. `supabase/tests/shop_order_operations_phase5.sql`: atribuição, preparação, entrega total/parcial, indisponibilidade, cancelamento e falha.
4. `supabase/tests/shop_phase7_pilot_day.sql`: simulação integral do dia de operação e reconciliação do stock.
5. `supabase/tests/shop_order_payments_phase8.sql`: pagamentos parciais, replay idempotente, sobrepagamento, referência de provider, fila e relatório.
6. Confirmar que cada teste termina com `ROLLBACK`; validar que não restam tenants `phase7pilot-%`, `phase5-%` ou `shop-payment-qa-%`.

## Checklist de aceitação humana

Preencher após uma pessoa executar cada tarefa na interface, não apenas por execução SQL:

| Tarefa | Proprietário/gestor | Recepção | Barbeiro |
|---|---|---|---|
| Criar/verificar artigo e fotografia | ☐ | N/A | N/A |
| Aceitar pedido e atribuir responsável | ☐ | ☐ | N/A |
| Preparar e marcar pronto | ☐ | ☐ | ☐ |
| Entrega parcial com motivo | ☐ | ☐ | ☐ |
| Cancelamento/indisponibilidade/no-show | ☐ | ☐ | ☐ |
| Confirmar pagamento sem inferir provider | ☐ | ☐ | N/A |
| Reconciliar stock e relatório diário | ☐ | ☐ | N/A |

**Registo obrigatório:** barbearia/tenant de QA, data/hora local, formandos, formador, evidência das tarefas, incidentes encontrados, acções correctivas e aceite do responsável. Não preencher assinaturas nem nomes automaticamente.

## Go / No-Go

GO técnico apenas com migrations alinhadas ao esquema, contrato SQL verde, build/CI verde, rate limit, allowlist de origens e runtime comprovados, rollback testado e nenhuma regressão crítica.

GO operacional apenas depois de proprietários/gestores, recepção e barbeiros realizarem o ensaio na interface e assinarem a aceitação. Um teste automatizado é evidência técnica e não prova formação humana.

A flag pública permanece desligada se qualquer gate falhar. Não activar álcool, providers externos ou pagamentos automáticos neste piloto.
