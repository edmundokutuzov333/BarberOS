# BarberOS | Loja da Barbearia | Fase 2: catálogo de gestão

**Estado:** Implementado em `main`, validado em staging. A Loja da Barbearia permanece desligada ao público; a Fase 0 continua NO-GO.

## Âmbito

A especificação PDF, páginas 14 e 20, define o catálogo de gestão: produtos, categorias, variantes, imagens com origem/autorização, preços, publicação, stock e histórico. A experiência pública do catálogo foi acrescentada na Fase 3; a criação consistente de pedidos continua na Fase 4.

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
- A flag `barbershops.shop_enabled` continua falsa em todos os tenants verificados. O catálogo público e o passo do wizard estão ligados condicionalmente, mas nenhum tenant foi activado.

## Migrations e testes

- `20261023093733_shop_catalog_management_phase2`: proveniência e aprovação de imagens, auditoria append-only, políticas e leitura pública por colunas.
- `20261023094656_shop_catalog_image_authorizer_fk_index`: índice da FK do utilizador que autorizou a imagem.
- `20261023095613_shop_catalog_management_phase2`: permissões de actualização por coluna, sem escrita directa de stock.
- `20261023095633_shop_catalog_publication_guard_phase2`: guarda de publicação e leitura de auditoria.
- `20261023100515_shop_catalog_image_metadata_privilege_hardening`: mantém os timestamps de verificação e o actor da aprovação de imagem sob controlo do PostgreSQL.
- `20261023100819_shop_catalog_product_rules_and_duplicate`: adiciona preferências permitidas validadas no PostgreSQL e a RPC de duplicação.
- `20261023100829_shop_catalog_duplicate_service_role_contract`: restringe a duplicação ao membership owner/manager ou runtime `service_role`.
- `20261023101554_shop_order_options_validator_execute_grant`: autoriza o validador da constraint para o papel autenticado que edita o catálogo.
- `supabase/tests/shop_catalog_phase2.sql`: fixtures rollback-only. Verifica rejeição de publicação sem variante, rejeição com categoria inactiva, publicação válida, ausência de update directo ao stock e grants de edição/auditoria.
- `supabase/tests/shop_catalog_rules_phase2.sql`: valida preferências JSON, limite de 10 opções, duplicação transaccional, isolamento de tenant, variantes inactivas sem SKU e stock inicial zero.

A suite SQL passou directamente em staging, incluindo os testes que impedem a falsificação de `image_source_checked_at` e `image_authorized_by`. No commit `67c595a5a5a3591b065b15d72893db75a6ea0b67`, o workflow de verificação `39937302849` concluiu com sucesso: migrations aplicadas a partir de uma base vazia, 61 contratos pgTAP e os três contratos SQL transaccionais; o frontend CI `39937303002` também passou lint, typecheck, unit/component tests, build, acessibilidade e orçamento de assets. Os gates separados da Fase 23 e da Fase 25 continuam bloqueados por `BARBEROS_TEST_DATABASE_URL` vazio; o benchmark público Fast 3G também excedeu o LCP de 2.500 ms (medições de 2.856 ms e 3.120 ms).

## Limites e gate

A Fase 2 não significa que a Loja da Barbearia esteja pronta para clientes. A UI pública da Fase 3 está em main, mas a selecção não é persistida como pedido e a submissão com artigos está bloqueada até à transacção marcação+pedido e à reserva concorrente de stock da Fase 4. A fila operacional completa (Fase 5) e o lançamento piloto também estão pendentes.

A Fase 0 permanece **NO-GO** porque o schema e as migrations de produção não estão reconciliados com o código de `main`, a Edge Function `booking-create` diverge, a configuração Turnstile não está comprovada, falta `BARBEROS_TEST_DATABASE_URL` no CI e as credenciais do deployment Vercel não estão configuradas no workflow. Não aplicar migrations da loja à produção nem activar qualquer tenant.
