# BarberOS | Fase 4: pedido de produtos atómico com a marcação

**Estado de código:** o workflow [39975771201](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39975771201) confirmou no SHA `d5c3c3b27eae8b6ef37137b460062eec06e518e0` a migration chain desde uma base vazia, pgTAP, contratos SQL das Fases 1–4 e corrida de stock em duas sessões, além dos gates frontend e deployment. A suite Phase 23 está a ser reparada separadamente.  
**Estado de lançamento:** **NO-GO**. Não activar `VITE_SHOP_PUBLIC_CATALOG_ENABLED` nem `barbershops.shop_enabled` em produção antes da reconciliação segura do schema/histórico, configuração Turnstile, aceitação dedicada e verificação dos gates no SHA candidato.

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

O teste transaccional passou em staging em 23 de Outubro de 2026 e as consultas posteriores confirmaram zero pedidos, linhas, reservas ou barbearias activadas após o `ROLLBACK`. O workflow [39975771201](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39975771201), no SHA `d5c3c3b27eae8b6ef37137b460062eec06e518e0`, repetiu com sucesso a migration chain desde uma base vazia, pgTAP, os contratos SQL das Fases 1–4 e o teste de corrida de duas sessões; exactamente um pedido reservou a última unidade.

A suite Phase 23 ultrapassou os problemas anteriores de cursor multi-statement, expectativa CRM e permissões de token. A execução [39975771339](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39975771339) encontrou `WAITLIST_EXPIRE_FAILED`: uma migration posterior (Fase 15) substituía a função de expiração e voltava a devolver o estado antigo `offered`, apesar de gravar `expired`. A correcção forward-only `20261023152000_waitlist_expire_status_persistence.sql` volta a sincronizar o estado devolvido e mantém a função acessível apenas a `service_role`. O runner Python também fará rollback explícito após qualquer erro para permitir a limpeza das fixtures sem esconder a falha original. A nova CI é o critério de confirmação, não a mera presença destes ficheiros.

## Migration e ambientes

O staging já registava a migration `20261023124453_shop_order_atomic_phase4`, mas o ficheiro não existia em `main`. O artefacto foi reconstruído a partir das definições de funções verificadas no staging e reposto com o mesmo identificador. A versão versionada foi corrigida para terminar cada definição SQL com ponto e vírgula, sem reescrever o histórico Git. A migration cria/adiciona `request_hash`, instala o RPC combinado, a leitura por token e o trigger de ciclo de vida.

**Não foi aplicada migration à produção.** A produção continua sem `barbershops.shop_enabled`, sem as tabelas de pedidos/reservas e sem `book_appointment_with_shop_order_idempotent`. O histórico de migrations tem versões equivalentes com timestamps diferentes; não é seguro marcar versões como aplicadas ou executar um `db push` amplo. Main terá 134 ficheiros SQL, staging 97 versões registadas e produção 110.

## Gates de lançamento ainda abertos

1. **Reconciliação de produção:** o Supabase de produção tem 110 registos de migrations e o staging 97; o repositório contém 134 ficheiros SQL versionados. As versões mais recentes da Loja existem no staging, mas não em produção. Não é seguro executar `supabase db push` nem carimbar migrations como aplicadas sem comparar as definições efectivas e preservar as tabelas próprias da produção.
2. **Aceitação:** a suite SQL da Fase 4 passou. A suite de aceitação Phase 23 está a ser repetida depois da correcção da RPC de expiração da waitlist. O E2E de ciclo completo no browser continua **ignorado**, porque não estão configurados os quatro segredos próprios `BARBEROS_E2E_FULL`, `BARBEROS_E2E_EMAIL`, `BARBEROS_E2E_PASSWORD` e `BARBEROS_E2E_FULL_RESET_URL`; o smoke E2E passou e o teste ignorado não conta como aprovação.
3. **Performance:** o workflow [39974629196](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39974629196) passou os três jobs no SHA `67d299b4b25b81cba0848b7c57e63e2819742ca6`: LCP 2.172/2.264 ms, DOMContentLoaded 1.280/1.263 ms, CLS 0, RPC 415/440 ms e INP 80/104 ms. Esta documentação é alterada no mesmo commit candidato para provocar uma nova execução; a aprovação para lançamento exige que o gate também passe no SHA candidato exacto.
4. **Turnstile e segredos de runtime:** a enumeração das variáveis Vercel não encontrou `VITE_TURNSTILE_SITE_KEY` nem `VITE_BOOKING_TURNSTILE_REQUIRED`. Os segredos de produção não foram expostos nem se consideram confirmados sem a verificação protegida do workflow Supabase.
5. **Catálogo comercial real:** não foi confirmada uma configuração de produtos, variantes, preços, fotografias autorizadas e stock para uma barbearia piloto. Não publicar produtos fictícios nem activar um tenant sem validação do operador.
6. **Publicação backend:** a Edge Function `booking-create` em produção continua na versão 1, enquanto o staging usa a versão 5 com Turnstile, rate limit, fingerprint e pedido de loja atómico. O contrato de produção tem de ser actualizado depois da reconciliação, nunca antes.

A Loja permanece desligada em produção. Esta decisão é necessária porque o schema público actual não contém `barbershops.shop_enabled`, as tabelas de pedido/reservas nem o RPC `book_appointment_with_shop_order_idempotent`. Activar o passo no frontend antes dessas dependências provocaria chamadas a funções inexistentes. O relatório `docs/BARBEROS_SHOP_PRODUCTION_RECONCILIATION.md` regista a evidência e um plano de reconciliação forward-only.

## Performance do percurso público

A medição pública mais recente já passa os limites de performance definidos, conforme a secção `Última medição confirmada` de `docs/PHASE25-PERFORMANCE.md`. A medição é read-only e cobre carregamento público, não certifica a transacção da Loja. A nova execução do gate no SHA candidato é necessária antes da conclusão global.

## Correcção da libertação de reservas

A migration aditiva `20261023133806_20261023134000_shop_order_reservation_release_phase4` liberta reservas activas no mesmo ciclo transaccional quando o pedido associado à marcação é cancelado. A migration chain desde uma base vazia e o contrato atómico voltaram a passar no workflow `39975771201` no SHA `d5c3c3b27eae8b6ef37137b460062eec06e518e0`.

## Correcção do contrato de expiração da waitlist

A função `public.expire_waitlist_offer(uuid)` foi redefinida na Fase 15 para suprimir notificações e rodar o slot, mas essa redefinição omitiu `w.status := 'expired'`; assim devolvia o estado `offered` mesmo depois da actualização. A migration forward-only `20261023152000_waitlist_expire_status_persistence.sql` corrige o resultado sem abrir permissões públicas e será validada por uma nova suite SQL de aceitação.

## Conclusão

A atomicidade da Fase 4 está verificada em staging e no CI actual da `main`, incluindo concorrência de stock e libertação de reservas. A aceitação mais ampla, a configuração de segurança e a reconciliação de produção continuam gates impeditivos. A Fase 4 de código está implementada; a Loja ainda **não está certificada para receber pedidos reais em produção**.
