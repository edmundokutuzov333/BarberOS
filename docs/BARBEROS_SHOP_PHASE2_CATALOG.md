# BarberOS | Loja da Barbearia | Fase 2: catálogo de gestão

**Estado:** Implementado em `main`, validado em staging. A Loja da Barbearia permanece desligada ao público; a Fase 0 continua NO-GO.

## Âmbito

A especificação PDF, páginas 14 e 20, define o catálogo de gestão: produtos, categorias, variantes, imagens com origem/autorização, preços, publicação, stock e histórico. A interface não integra ainda o passo público do wizard nem a criação de pedidos, que pertencem às Fases 3 e 4.

## Interface entregue

- Rota `/app/loja/produtos`, com navegação `Loja` e acesso limitado a owner/manager.
- Produtos: criar/editar, marca, categoria, descrição, tipo (consumo no local/para levar/ambos), controlo de stock, fotografia, texto alternativo, origem/autorização e pré-visualização.
- Categorias: criar/editar, ordenar e activar/ocultar.
- Variantes: formato/unidade, SKU opcional, preço em MT, alerta de stock baixo e activação.
- Stock: ajuste de entrada/saída com motivo obrigatório via RPC `record_shop_inventory_movement`; histórico dos últimos 100 movimentos.
- Histórico: auditoria de criação/alteração com estado anterior e posterior.
- Estados de carregamento, erro, vazio e preview interno; aviso persistente quando a loja está desligada.

## Segurança e regras

- Queries e mutations usam o tenant activo e o backend confirma o membership via RLS. A rota só é permitida a owner/manager.
- O upload reutiliza o bucket público existente `shop-photos` e o caminho por tenant, cuja política exige membership owner/manager. Não há importação automática de imagens da Internet.
- A ficha da imagem exige texto alternativo e nota de origem/autorização; o trigger regista quem confirmou e quando.
- O PostgreSQL rejeita publicar produto sem uma variante activa ou com categoria inactiva.
- A migration de privilégios permite apenas actualizar colunas comerciais; não permite alterar directamente `stock_on_hand`, identidade do tenant ou identificadores de variante/produto. O saldo só muda pelo ledger transaccional.
- A flag `barbershops.shop_enabled` continua falsa. O catálogo público e o wizard não foram ligados.

## Migrations e testes

- `20261023093733_shop_catalog_management_phase2`: proveniência e aprovação de imagens, auditoria append-only, políticas e leitura pública por colunas.
- `20261023094656_shop_catalog_image_authorizer_fk_index`: índice da FK do utilizador que autorizou a imagem.
- `20261023095613_shop_catalog_management_phase2`: permissões de actualização por coluna, sem escrita directa de stock.
- `20261023095633_shop_catalog_publication_guard_phase2`: guarda de publicação e leitura de auditoria.
- `supabase/tests/shop_catalog_phase2.sql`: fixtures rollback-only. Verifica rejeição de publicação sem variante, rejeição com categoria inactiva, publicação válida, ausência de update directo ao stock e grants de edição/auditoria.

A suite SQL passou directamente em staging. O CI remoto ainda tem de validar o commit final, incluindo typecheck, lint, build e execução do contrato num schema local limpo.

## Limites e gate

A Fase 2 não significa que a Loja da Barbearia esteja pronta para clientes. Não foram implementados o wizard público (Fase 3), a transacção marcação+pedido e a reserva concorrente de stock (Fase 4), a fila operacional completa (Fase 5) ou o lançamento piloto.

A Fase 0 permanece **NO-GO** porque o schema e as migrations de produção não estão reconciliados com o código de `main`, a Edge Function `booking-create` diverge, a configuração Turnstile não está comprovada, falta `BARBEROS_TEST_DATABASE_URL` no CI e as credenciais do deployment Vercel não estão configuradas no workflow. Não aplicar migrations da loja à produção nem activar qualquer tenant.
