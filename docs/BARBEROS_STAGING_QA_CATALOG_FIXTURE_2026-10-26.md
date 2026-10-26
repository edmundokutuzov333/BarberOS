# BarberOS | Registo de fixture de catálogo QA | 26 de Outubro de 2026

## Âmbito

Foram adicionadas nove fixtures de produto ao tenant de staging `shop-phase8-preview-qa`, denominado **BarberOS Preview QA (NÃO COMERCIAL)**, no projecto Supabase `asikuyxaapcmayptimxi`. Não foi feita qualquer inserção de catálogo em produção.

A fixture existe para exercitar registo de artigos, variantes/SKUs, preço em unidades menores, saldo de stock e ledger de movimentos. Não constitui inventário de uma barbearia real, preço de venda aprovado, verificação física ou licença de imagem.

## Itens de teste

Todos os nomes são prefixados por `TESTE QA |`; os SKUs são prefixados por `TEST-QA-`.

| Artigo de simulação | Preço de simulação | Saldo fictício |
| --- | ---: | ---: |
| Água Namaacha 500 ml | 30 MT | 12 |
| Fonte Fresca 500 ml | 15 MT | 12 |
| Água Namaacha 1,5 L | 40 MT | 6 |
| Coca-Cola Original 330 ml | 55 MT | 8 |
| Coca-Cola Zero 330 ml | 51 MT | 6 |
| Fanta Laranja 330 ml | 50 MT | 6 |
| Ceres Laranja 200 ml | 45 MT | 4 |
| Cappuccino por porção | 120 MT | 5 |
| Óleo de barba 30 ml | 250 MT | 3 |
| **Total de unidades fictícias** | | **62** |

Os preços das bebidas são valores de referência pública de retalhistas, não preços aprovados para esta barbearia; podem divergir por vendedor, embalagem, data e canal. Cappuccino e óleo de barba usam valores ilustrativos do wireframe do projecto. Nenhum dos nove preços foi confirmado comercialmente pelo operador.

## Controlos de segurança e estado actual

- Os nove produtos e as nove variantes estão inactivos.
- `catalog_verified_at`, `catalog_verified_by`, `image_authorized_at` e `image_authorized_by` permanecem vazios.
- Não foram adicionados URLs de fotografia comercial. Não existe aprovação simulada de direitos de imagem.
- Cada variante tem um movimento `opening_balance` anotado como **STOCK FICTÍCIO QA**.
- O saldo de cada variante foi reconciliado para corresponder à soma de movimentos no ledger. O trigger de movimentos já incrementa `stock_on_hand`; por isso, a carga inicial foi corrigida para evitar duplicação.
- O tenant de QA continua identificado como não comercial. A flag de Loja em produção permanece desligada.

## Testes executados em staging

Executados sem erro SQL, com transacções revertidas pelos próprios ficheiros de teste:

- `supabase/tests/shop_catalog_phase7.sql`: validação do catálogo, aprovação de publicação, invalidação após alteração e isolamento do tenant.
- `supabase/tests/shop_phase8_incidents.sql`: ciclo de vida de incidentes, autorização por tenant e histórico de auditoria.
- `supabase/tests/shop_phase7_pilot_day.sql`: simulação operacional de pedidos, stock, entrega e reconciliação.

A verificação posterior confirmou zero tenants temporários de teste remanescentes, zero pedidos/pagamentos de teste persistidos, nove produtos QA inactivos, nove variantes, nove movimentos de abertura e 62 unidades de stock simulado. O saldo corresponde ao ledger.

## Produção verificada após os testes

Projecto `alseiinjzwjdiwtvkdzy`:

- 4 barbearias;
- 0 barbearias com `shop_enabled=true`;
- 0 produtos;
- 0 variantes;
- 0 movimentos de stock;
- 0 pedidos da Loja;
- 0 pagamentos da Loja.

## Próximo critério de saída

A fixture permite testes de catálogo e de ledger, mas não representa aceitação operacional nem um catálogo publicável. Para activar um catálogo comercial são necessárias confirmação física por um responsável autorizado, preço de venda aprovado, stock contado, imagem e proveniência autorizadas, e ensaio ponta a ponta com operador. Não remover os prefixos QA nem activar estes registos como mercadoria real.
