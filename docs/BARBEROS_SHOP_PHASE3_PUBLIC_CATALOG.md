# BarberOS | Loja da Barbearia | Fase 3: experiência pública do catálogo

**Estado de engenharia:** implementação do catálogo público e do passo opcional do wizard preparada para `main`; RPC e contrato SQL verificados em staging. **Não é uma autorização de lançamento.** A loja continua desactivada e a Fase 0 mantém o estado NO-GO.

## Contrato do passo público

A especificação PDF v1.0, páginas 8, 20, 22 e 24, pede um passo opcional depois de serviço, corte, barbeiro, data e hora. A página apresenta produtos publicados pela própria barbearia, categorias, pesquisa, variantes e preços em MT, disponibilidade, quantidades, preferências configuradas e subtotal dos produtos separado do serviço. Tem estados de carregamento, erro, catálogo vazio, pesquisa sem resultados e artigos esgotados. «Continuar sem produtos» está sempre explícito e remove qualquer pré-selecção local.

A activação exige duas barreiras: `VITE_SHOP_PUBLIC_CATALOG_ENABLED=true` no build e `barbershops.shop_enabled=true` na barbearia. A primeira fica desligada por defeito e evita chamadas RPC em produção enquanto o schema não estiver reconciliado; a segunda é a fonte de verdade do tenant no servidor. Quando o gate global está desligado, a query nem é executada e o wizard conserva os seis passos. Com a query activa, um tenant desligado recebe `enabled=false` e listas vazias.

## Backend público e protecção de dados

Migration: `supabase/migrations/20261023120503_shop_public_catalog_phase3.sql`.

A RPC `get_public_shop_catalog(p_slug)` é `SECURITY DEFINER`, tem `search_path` vazio e resolve a barbearia pelo slug antes de construir o DTO. Filtra produtos, categorias e variantes inactivos e categorias que não pertencem ao tenant. A disponibilidade enviada ao browser é apenas booleana; não expõe stock físico, reservas, metadados privados da origem/aprovação da imagem, marcações, clientes ou tokens. O cálculo considera reservas activas e não expiradas e respeita a configuração de controlo de stock. A RPC não aceita nem recebe preços ou totais do browser e não cria encomendas.

## Fronteira deliberada com a Fase 4

A Fase 4 da especificação é responsável por integrar o contrato seguro `booking-create`, validar IDs/preços/stock no servidor, criar pedido e linhas transaccionalmente, tratar idempotência e reservar/libertar stock. Esse contrato ainda não está integrado na submissão deste wizard. Por isso:
- a selecção do passo é apenas estado local, não pedido persistido;
- a interface avisa disso e impede confirmar a marcação com artigos seleccionados, para não perder escolhas ou afirmar que foram encomendadas;
- «Continuar sem produtos» limpa o estado local e mantém disponível o percurso de marcação existente;
- não activar `barbershops.shop_enabled` em nenhum tenant até a Fase 4 e os gates da Fase 0 serem resolvidos.

Esta limitação é intencional e explícita; o gate de uso real com artigos continua pendente. Não encaminhar a selecção por notas de marcação.

## Testes

O contrato transaccional `supabase/tests/shop_public_catalog_phase3.sql` usa fixtures isoladas e `ROLLBACK`. Verifica tenant, flag desligada, publicação, categoria inactiva, variantes activas, preço em unidade menor de MT, disponibilidade após reserva de stock, stock não controlado, grants de execução e ausência de campos privados.

O contrato é incluído em `.github/workflows/ci.yml` depois das migrations e dos contratos das Fases 1 e 2. A validação estática da interface encontra-se em `frontend/tests/components/phase23-page-contracts.mjs`. O percurso end-to-end de submissão com produtos só poderá ser certificado depois da Fase 4; a suite de aceitação exige ainda `BARBEROS_TEST_DATABASE_URL` e credenciais de ambiente.

## Segurança e release

- Nenhuma barbearia foi activada; a flag por tenant continua falsa. O gate global `VITE_SHOP_PUBLIC_CATALOG_ENABLED` deve continuar ausente/falso em produção até à Fase 4.
- A migration e o contrato SQL foram executados no projecto Supabase **staging** `asikuyxaapcmayptimxi`, nunca em produção.
- A integração Git da Vercel publicou automaticamente o commit inicial da Fase 3. A consulta de produção confirmou que ainda não existe `get_public_shop_catalog` nem `barbershops.shop_enabled`; por isso foi acrescentado o gate global por defeito desligado numa correcção subsequente para remover a chamada a RPC inexistente. O percurso público `/barbearia/oryon/marcar` respondeu HTTP 200, o que não substitui uma certificação browser de ponta a ponta.
- Não foram alterados `booking-create`, as transacções existentes de marcação, as reservas de stock nem dados de produção.
- A Fase 0 continua NO-GO devido ao histórico/schema do motor de marcações, à configuração Turnstile, à suite de aceitação dedicada, ao deployment Vercel não autenticado no workflow e ao gate de performance documentado em [BARBEROS_SHOP_PHASE0_READINESS.md](BARBEROS_SHOP_PHASE0_READINESS.md).
