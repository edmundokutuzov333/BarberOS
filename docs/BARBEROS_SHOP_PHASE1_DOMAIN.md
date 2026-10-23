# BarberOS | Loja da Barbearia | Fase 1: modelo de domínio

**Data:** 23 de Outubro de 2026  
**Repositório:** [edmundokutuzov333/BarberOS](https://github.com/edmundokutuzov333/BarberOS)  
**Ambiente validado:** Supabase staging `asikuyxaapcmayptimxi`  
**Resultado da fase:** Modelo aplicado e contratos SQL aprovados em staging. **O lançamento integrado permanece NO-GO enquanto a Fase 0 não estiver certificada.**

## Âmbito executado

A Fase 1 do documento de especificação (PDF, páginas 17 a 18 e 20 a 22) pede o modelo das categorias, produtos, variantes, pedidos, linhas, movimentos de inventário e reservas; constraints, índices, RLS, funções de domínio, tipos gerados e testes SQL. Foi implementado apenas esse domínio. Não foram adicionados ecrãs, não foi modificado `BookingWizard` nem o handler `booking-create`, e não foi criado um caminho público para criar encomendas.

## Migrations aplicadas, sempre forward-only

| Versão no staging | Migration | Responsabilidade |
|---|---|---|
| `20261023090731` | `shop_domain_model_phase1` | Feature flag, tabelas, índices, FKs compostas, RLS, movimentos, reservas e transições base. |
| `20261023091111` | `shop_catalog_write_privileges_hardening` | Restringe colunas de inserção e remove eliminação directa do catálogo para utilizadores autenticados. O saldo inicial só pode entrar pelo ledger. |
| `20261023091126` | `shop_order_transition_invariants` | Impede que a encomenda avance para pronta/entregue antes de as linhas satisfazerem os respectivos estados. |

A produção (`alseiinjzwjdiwtvkdzy`) não foi alterada e não recebeu nenhuma destas migrations.

## Modelo persistido

| Tabela | Função |
|---|---|
| `shop_product_categories` | Categorias e ordenação por barbearia. |
| `shop_products` | Produto, marca, descrição, activo, tipo de consumo/venda e metadados da imagem. |
| `shop_product_variants` | SKU, formato, atributos, preço em unidade menor de MT, stock e limiar de stock baixo. |
| `appointment_product_orders` | Cabeçalho do pedido e estados operacionais, ligado a uma única marcação do mesmo tenant. |
| `appointment_product_order_items` | Linhas com snapshots de nome, variante, preço, quantidade, opções e subtotal histórico. |
| `inventory_movements` | Ledger de entradas/saídas do stock e actor/motivo. |
| `inventory_reservations` | Quantidades temporariamente reservadas por pedido. |

O schema existente já contém as tabelas genéricas `public.products` e `public.stock_movements`. Foram preservadas sem alterações. A Loja da Barbearia usa as entidades específicas indicadas na especificação (`shop_products`, `shop_product_variants`, `inventory_movements`) em vez de alterar o contrato destas tabelas-base, que não têm ainda uma API de catálogo confirmada nesta fase.

## Invariantes e segurança

- `barbershops.shop_enabled` é `boolean NOT NULL DEFAULT false`. Produtos e categorias também começam inactivos. A leitura pública do catálogo exige uma barbearia pública, flag activa e registos activos. Nenhum tenant foi activado.
- FKs compostas impedem que categorias, produtos, variantes, marcações, pedidos, linhas, movimentos ou reservas sejam cruzados entre barbearias. A encomenda só pode referenciar uma marcação do mesmo tenant.
- Cada linha conserva snapshots comerciais. O total tem de ser exactamente `unit_price_snapshot * qty`; preço e quantidade não podem ser negativos/zero.
- `record_shop_inventory_movement` é `SECURITY DEFINER`, com `search_path` vazio, execução negada a `anon` e permitida apenas a utilizadores autenticados (com verificação de papel/tenant) e `service_role`. O trigger actualiza stock na mesma transacção do movimento, rejeita stock negativo e não permite consumir unidades reservadas.
- Utilizadores autenticados podem gerir o catálogo apenas no tenant a que pertencem como owner/manager. Não podem apagar directamente produtos, categorias ou variantes, nem inserir/actualizar directamente o saldo. Pedidos, linhas, movimentos e reservas não aceitam escrita directa de `anon` ou `authenticated`.
- A máquina de estados rejeita saltos inválidos. Um pedido não pode ser aceite para execução sem linhas, ficar pronto com linhas por preparar, nem ficar entregue com linhas ainda por entregar. Os estados operacionais não afirmam que houve pagamento.

## Prova executada

Foi executado directamente no staging o ficheiro `supabase/tests/shop_domain_phase1.sql`. O teste terminou sem erro. O resultado SQL foi um conjunto vazio de linhas, esperado para um bloco `DO` que lança excepção em qualquer falha. A execução cria dados de QA dentro de `BEGIN` e termina com `ROLLBACK`.

O teste exercitou:
- flag desligada por defeito e isolamento de tenant;
- rejeição de marcação cruzada entre tenants e variante de outro tenant numa linha;
- derivação de `requested_for` a partir da marcação;
- total de linha inválido rejeitado;
- movimento de stock, rejeição de saldo negativo e de consumo de stock reservado;
- sobre-reserva rejeitada e libertação de reserva auditada;
- transições válidas/inválidas para encomenda e linha;
- RLS nas sete tabelas, ausência de escrita de encomendas pelos clientes e bloqueio de edição/inserção directa do saldo da variante.

Os testes não certificam concorrência HTTP do booking, notificações externas, aceitação do utilizador, UI, nem consistência entre a Edge Function publicada na produção e o código. Estes temas continuam a ser gates distintos.

## Tipos TypeScript

`frontend/src/lib/database.types.ts` inclui os sete modelos, os três enums de domínio (`shop_product_kind`, `shop_order_status`, `shop_order_item_status`), a função `record_shop_inventory_movement` e a coluna `shop_enabled`. A geração foi feita a partir do schema do staging; os tipos de tabelas que existem apenas noutros ambientes foram preservados no ficheiro original, em vez de substituir todo o artefacto por uma geração incompleta.

## Estado de release

**NO-GO para a produção.** Esta entrega prepara o domínio de dados; não resolve o desfasamento de migrations da Fase 0, não confirma os secrets de runtime, não publica um novo `booking-create` e não integra a criação transaccional do pedido no fluxo de marcação. Manter a flag desligada. A Fase 2 não deve expor gestão do catálogo nem qualquer pedido até os gates correspondentes serem aprovados.
