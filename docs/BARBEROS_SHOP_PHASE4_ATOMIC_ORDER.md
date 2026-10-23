# BarberOS | Fase 4: pedido de produtos atómico com a marcação

**Estado de código:** publicado em `main`; typecheck, build, contratos SQL e corrida de stock em duas sessões passaram na verificação do commit `1279226d9f18c498b21211159cfdf94d472cfd6e`. O teste transaccional também foi executado em staging e terminou com `ROLLBACK`. 
**Estado de lançamento:** **NO-GO**. Não activar `VITE_SHOP_PUBLIC_CATALOG_ENABLED` nem `barbershops.shop_enabled` em produção enquanto o schema/histórico, Turnstile, aceitação dedicada e gate de performance não estiverem reconciliados e aprovados.

## Contrato funcional

A Fase 4 liga a pré-selecção da Fase 3 a um pedido persistido e à marcação no mesmo commit de base de dados. O cliente envia apenas IDs de variantes, quantidades, preferências permitidas e modo de consumo. Não envia preço, total de linha nem subtotal.

A Edge Function `booking-create` valida o payload e calcula um fingerprint SHA-256 do conteúdo comercial normalizado. O PostgreSQL revalida tenant, estado de publicação, variante, modo de consumo, opções e preço corrente; cria marcação, pedido, linhas com snapshots, reservas e resposta idempotente numa única transacção. Qualquer falha reverte a marcação, o pedido, as linhas e a chave de idempotência.

## Idempotência e concorrência

O RPC `book_appointment_with_shop_order_idempotent` é exclusivo de `service_role`. O replay da mesma chave com o mesmo fingerprint devolve o resultado já persistido. A reutilização da chave com fingerprint diferente é rejeitada. Linhas antigas de idempotência sem fingerprint são tratadas de forma conservadora, sem replay silencioso pelo Edge Function.

O stock físico não é decrementado no momento da reserva. A disponibilidade é calculada como stock existente menos reservas activas. O RPC bloqueia a barbearia e as variantes relevantes durante a transacção, impedindo que dois pedidos consumam a mesma unidade disponível. A criação de uma reserva falhada não deixa marcação nem registo de idempotência órfão.

O trigger `appointments_shop_order_lifecycle` cancela o pedido associado quando a marcação é cancelada, desde que o pedido ainda não esteja entregue, e liberta as reservas. Uma remarcação de um pedido ainda não preparado exige nova confirmação operacional.

## Experiência pública e leitura do pedido

O wizard envia os artigos seleccionados, limita a 20 variantes diferentes e suporta `consume_here` e `takeaway`. O cliente mantém a mesma chave em tentativas repetidas do mesmo payload e recebe uma chave nova quando os dados comerciais mudam. O preço é mostrado antes de confirmar e nunca é aceite como input autoritativo do browser.

O token gateway expõe a leitura `shop_order.get` com o token de gestão já associado à marcação. A página de gestão mostra os snapshots persistidos, quantidades, preferências, modo de consumo, estado do pedido e subtotal. O pedido não representa pagamento: o pagamento dos produtos não é iniciado nem simulado por esta fase.

## Testes

- `supabase/tests/shop_order_atomic_phase4.sql`: cria fixtures de barbearia, horário, produto e stock dentro de uma transacção; valida atomicidade, snapshots, idempotência, preço manipulado, falha de stock, cancelamento, libertação de reserva e grants; termina com `ROLLBACK`.
- `shop_order_concurrency_setup_phase4.sql` mais os dois ficheiros `call_*` e `assert_*`: executados pelo CI contra a base Supabase local efémera. Duas sessões tentam reservar uma unidade em horários distintos; exactamente uma deve confirmar e a outra falhar com `SHOP_STOCK_UNAVAILABLE`.
- Os contratos de frontend verificam o payload do wizard, o fingerprint, a ausência de preço enviado, a chamada RPC combinada e a leitura do pedido por token.

O teste transaccional passou em staging em 23 de Outubro de 2026 e as consultas posteriores confirmaram zero pedidos, linhas, reservas ou barbearias activadas após o `ROLLBACK`. O CI de `main` run [39973135133](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39973135133) concluiu com sucesso: migrations desde uma base vazia, contratos pgTAP, os contratos SQL das Fases 1–4 e a corrida concorrente de duas sessões passaram. A suite separada de aceitação da Fase 23 continua a falhar no runner Python ao executar um bloco `DO $` com cursor multi-statement; o runner está a ser corrigido para usar o protocolo SQL simples, sem dividir blocos PL/pgSQL.

## Migration e ambientes

O staging já registava a migration `20261023124453_shop_order_atomic_phase4`, mas o ficheiro não existia em `main`. O artefacto foi reconstruído a partir das definições de funções verificadas no staging e reposto com o mesmo identificador. A versão versionada foi corrigida para terminar cada definição SQL com ponto e vírgula, sem reescrever o histórico Git. A migration cria/adiciona `request_hash`, instala o RPC combinado, a leitura por token e o trigger de ciclo de vida.

**Não foi aplicada migration à produção.** A produção continua sem `barbershops.shop_enabled`, sem as tabelas de pedidos/reservas e sem `book_appointment_with_shop_order_idempotent`. O histórico de migrations tem versões equivalentes com timestamps diferentes; não é seguro marcar versões como aplicadas ou executar um `db push` amplo. Main terá 134 ficheiros SQL, staging 97 versões registadas e produção 110.

## Gates de lançamento ainda abertos

1. Plano forward-only para reconciliar o schema e o histórico de migrations da produção, validado em staging e aplicado sem reescrever o histórico.
2. Corrigir e repetir a suite de aceitação Phase 23: o workflow já provisiona uma base Supabase local efémera e define `BARBEROS_TEST_DATABASE_URL`; o executor `ClientCursor(conn)` já executa os blocos PL/pgSQL. A última falha foi uma expectativa demasiado restrita no teste de isolamento do CRM, que não aceitava `SHOP_OPERATOR_REQUIRED` como negação válida; o teste foi ajustado e aguarda nova CI. O ciclo completo de browser autenticado continua dependente de credenciais próprias.
3. Gate Fast 3G: LCP continua acima de 2500 ms no benchmark público anterior.
4. Configuração de Turnstile confirmada no deployment de produção. As variáveis públicas não aparecem na enumeração Vercel consultada e o wizard de produção falha fechado sem elas.
5. Deploy das Edge Functions e do schema de Fase 4 em produção, seguido de testes reais com a flag global e a flag do tenant desligadas primeiro e activação controlada apenas após os gates.

Até todos estes pontos passarem, a Fase 4 está implementada e verificada em staging/CI, mas não é segura para produção: o schema e a função `booking-create` publicados ainda não correspondem ao contrato versionado, Turnstile não foi comprovado e a aceitação Phase 23 ainda tem de ser repetida após a correcção do runner. A Loja não está autorizada a receber pedidos de clientes em produção.


## Performance do percurso público

O benchmark anterior identificou a descrição longa do hero como LCP (2,6–3,2 s) apesar de DCL próximo de 1,3 s. A descrição completa permanece disponível em “Sobre a barbearia”; o hero limita a prévia a uma linha para reduzir o candidato LCP. Esta alteração é uma hipótese de optimização a validar pelo gate Fast 3G; não é declarada aprovada até o workflow correr sobre o deployment actual.


## Correcção da libertação de reservas (23 de Outubro de 2026)

A suite CI da Fase 4 encontrou que o pedido era cancelado correctamente, mas as reservas permaneciam em estado `reserved`. Foi aplicada em staging a migration aditiva `20261023133806_20261023134000_shop_order_reservation_release_phase4`, que instala `private.shop_order_release_reservations_on_cancel` e um trigger `AFTER UPDATE OF status` sobre `appointment_product_orders`. A mudança para `cancelled` liberta as reservas ainda activas dentro da mesma transacção. A migration foi versionada em `main`; o CI completo ainda tem de repetir a suite a partir de uma base vazia.
