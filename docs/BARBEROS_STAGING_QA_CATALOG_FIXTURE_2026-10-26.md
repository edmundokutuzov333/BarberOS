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

- Após a activação controlada em staging (26 de Outubro de 2026, 15:22 UTC), os nove produtos e as nove variantes estão activos exclusivamente no tenant de QA. A antiga fixture `QA ONLY: Água de teste 500 ml` e a respectiva variante foram desactivadas, preservando os registos para auditoria.
- Os nove produtos têm registo de verificação QA e a ilustração SVG original genérica foi registada como imagem de teste pelo actor de QA existente. Isto é aprovação técnica de fixture, não validação física de produto nem autorização para usar fotografias de marcas.
- Não foram adicionadas fotografias comerciais nem imagens de embalagem de marcas. A ilustração apresenta a indicação `SIMULACAO QA / NAO COMERCIAL`; o texto alternativo e a descrição de cada produto esclarecem que o stock e preço são fictícios.
- Cada variante tem um movimento `opening_balance` anotado como **STOCK FICTÍCIO QA**.
- O saldo de cada variante foi reconciliado para corresponder à soma de movimentos no ledger. O trigger de movimentos já incrementa `stock_on_hand`; por isso, a carga inicial foi corrigida para evitar duplicação.
- O tenant de QA continua identificado como não comercial. A flag de Loja em produção permanece desligada.

## Testes executados em staging

Executados sem erro SQL, com transacções revertidas pelos próprios ficheiros de teste:

- `supabase/tests/shop_catalog_phase7.sql`: validação do catálogo, aprovação de publicação, invalidação após alteração e isolamento do tenant.
- `supabase/tests/shop_phase8_incidents.sql`: ciclo de vida de incidentes, autorização por tenant e histórico de auditoria.
- `supabase/tests/shop_phase7_pilot_day.sql`: simulação operacional de pedidos, stock, entrega e reconciliação.

A verificação posterior à activação confirmou: zero tenants temporários de teste remanescentes, zero pedidos/pagamentos de teste persistidos, nove produtos QA activos, nove variantes activas, nove movimentos de abertura e 62 unidades de stock simulado. O saldo corresponde ao ledger. A RPC pública devolve `enabled=true` e os nove artigos têm prefixo `TESTE QA |`, marca `SIMULAÇÃO QA` e descrição expressa de que não são ofertas comerciais. O preview da Vercel ligado ao staging respondeu HTTP 200 e é marcado `noindex`.

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


## Resultado da activação de QA

O catálogo de demonstração foi activado apenas em staging no tenant `shop-phase8-preview-qa`, que se mantém denominado **BarberOS Preview QA (NÃO COMERCIAL)**. O catálogo público de staging devolve 9 artigos visíveis e disponíveis para simular selecção, com preços de teste e 62 unidades simuladas. O fluxo foi validado por consulta à RPC pública e resposta HTTP 200 do URL de preview:

`https://barber-b7az52ser-kutuzov.vercel.app/barbearia/shop-phase8-preview-qa/marcar`

O URL é uma pré-visualização de staging, não a Loja comercial de produção. As quatro barbearias em produção permanecem com `shop_enabled=false`, sem produtos ou variantes, e não foram alteradas por esta activação. Não foram inseridos pedidos nem pagamentos na activação.
