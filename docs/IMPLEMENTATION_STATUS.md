# BarberOS — estado das 10 fases

## Implementado no repositório

- Gateway público `/`, escolha cliente/gestão, links curtos `/b/:slug` e QR scanner lazy.
- Booking público via Edge Function, idempotência, rate limits, Turnstile, CORS por allowlist e revogação de DML público sensível.
- Email-first: fila de notificações, retries classificados e preferência de canais persistida. A verificação Svix do Resend passa a ter testes unitários para assinatura válida, alteração do corpo, timestamp expirado, cabeçalhos incompletos, segredo malformado e versão desconhecida.
- O ledger de eventos Resend e o RPC `record_email_event` ficam versionados com RLS, acesso apenas de `service_role` e deduplicação por ID de evento. A migration aditiva foi aplicada e o contrato SQL foi verificado no staging; a produção continua sujeita ao workflow de release protegido.
- Disponibilidade semanal via RPC batch com cache/refetch no cliente.
- O formulário público aceita telefone sem exigir email; se não houver email, o cliente é instruído a guardar o link de gestão apresentado no fim. A entrega automática continua dependente dos providers e segredos activos.
- Em builds de produção, a marcação exige a chave pública e o token Turnstile. Se a chave não estiver configurada, a UI bloqueia a submissão e explica a indisponibilidade, em vez de deixar o cliente avançar para uma chamada que o backend irá rejeitar.
- PWA instalável, service worker, manifest, i18n (pt-MZ, pt-PT, pt-BR, en, es) e páginas de privacidade/termos.
- Fundamentos de CRM/privacy: consentimento, anonymização, exportação de dados e índices de retenção.
- Fundamentos de escala: convites, portfólio, produtos, movimentos de stock, chaves API, webhooks, deliveries e push subscriptions.
- Healthcheck Edge Function, contrato de deploy, scan de secrets e CI consolidado para lint, typecheck, testes, build e budget.
- Monitorização agendada a cada 15 minutos de rotas públicas, headers de segurança e saúde do Supabase; as falhas geram uma execução GitHub Actions com erro. Notificação externa por SMS/WhatsApp continua por configurar.

## Loja da Barbearia: fases 0, 1 e 2

### Fase 0: resultado da auditoria

- A auditoria de 23 de Outubro de 2026 continua a classificar o lançamento integrado com marcações como **NO-GO**: o histórico de migrations e os schemas divergem, a função publicada em produção não corresponde ao handler versionado e a aceitação HTTP com secrets/runtime dedicados não foi certificada.
- As Fases 1 e 2 foram implementadas em `main` e aplicadas apenas no staging. Não alteram o motor de marcações, não criam pedidos automaticamente e não mudam a base de dados de produção.
- A feature flag `barbershops.shop_enabled` existe agora **apenas no staging**, com `NOT NULL DEFAULT false`. Nenhuma barbearia ficou activada.

### Fase 1: modelo de domínio

- Aplicadas em staging cinco migrations forward-only: `shop_domain_model_phase1`, `shop_catalog_write_privileges_hardening`, `shop_order_transition_invariants`, `shop_foreign_key_covering_indexes` e `shop_feature_flag_server_guard`.
- Criadas as tabelas `shop_product_categories`, `shop_products`, `shop_product_variants`, `appointment_product_orders`, `appointment_product_order_items`, `inventory_movements` e `inventory_reservations`, com índices, constraints compostas de tenant, RLS e estados de domínio.
- O ledger actualiza stock atomicamente. A RPC `record_shop_inventory_movement` valida tenant, motivo, direcção e saldo; stock negativo, sobre-reserva e consumo de stock reservado são rejeitados. Os clientes autenticados não podem inserir/apagar directamente as entidades comerciais nem alterar/inserir directamente o saldo.
- A máquina de estados bloqueia transições inválidas; um pedido não passa a pronto enquanto as linhas não estiverem prontas, nem a entregue enquanto todas as linhas não estiverem entregues.
- O contrato de índices de FKs detectou inicialmente 22 referências sem cobertura; a migration correctiva cria os índices em falta e a mesma verificação executada em staging devolve agora zero referências descobertas. O trigger `shop_feature_flag_guard` também bloqueia tentativas de definir `shop_enabled` por `anon`/`authenticated`, apesar dos grants antigos da tabela.
- `frontend/src/lib/database.types.ts` foi actualizado com os sete modelos, os três enums, a RPC e a flag. Os tipos foram gerados a partir do schema de staging e integrados no ficheiro existente sem eliminar os contratos de tabelas que só existem noutros ambientes.
- A suite `supabase/tests/shop_domain_phase1.sql` foi executada em staging e passou. Os fixtures correm dentro de transacção e são revertidos; verificam tenant, snapshots/total, stock, reservas, transições e privilégios.
- O wizard público e o acoplamento transaccional de pedidos continuam fora do âmbito implementado. Não activar a loja nem aplicar estas migrations à produção até o gate de Fase 0 ser resolvido e aprovado.
- Relatório técnico: [BARBEROS_SHOP_PHASE1_DOMAIN.md](BARBEROS_SHOP_PHASE1_DOMAIN.md).

### Fase 2: catálogo de gestão

- Implementada a rota `/app/loja/produtos`, a entrada de navegação `Loja` e o controlo de acesso a owner/manager. O catálogo usa queries Supabase reais e filtra todas as operações por `barbershop_id`.
- O gestor pode criar/editar/duplicar produtos, gerir categorias, variantes, preços, preferências permitidas por produto, estado de publicação, metadados e upload de imagem, pré-visualizar a ficha, ajustar stock através da RPC `record_shop_inventory_movement` e consultar movimentos e auditoria.
- A publicação é validada no PostgreSQL: não é permitido publicar produto sem variante activa nem com categoria inactiva. As preferências de pedido são validadas no servidor (máximo 10 strings, 1 a 80 caracteres). A duplicação usa RPC transaccional, mantém o original intacto e cria variantes inactivas com stock zero. A imagem exige texto alternativo e origem/autorização. A feature flag desligada continua a impedir exposição pública.
- As permissões SQL da Fase 2 permitem actualizar apenas as colunas comerciais necessárias. A escrita directa de `stock_on_hand` permanece proibida; as alterações passam pelo ledger. `image_source_checked_at`, `image_authorized_by` e `image_authorized_at` são campos geridos pelo PostgreSQL. As migrations da Fase 2 e os testes `supabase/tests/shop_catalog_phase2.sql` e `supabase/tests/shop_catalog_rules_phase2.sql` foram aplicados/executados em staging.
- Relatório técnico: [BARBEROS_SHOP_PHASE2_CATALOG.md](BARBEROS_SHOP_PHASE2_CATALOG.md).

### Fase 3: catálogo público opcional

- Adicionada a RPC pública `get_public_shop_catalog(p_slug)`, com DTO por tenant, flag de rollout, catálogo activo, variantes/preços e disponibilidade booleana calculada no servidor sem expor saldo ou reservas.
- Implementado `frontend/src/features/public-shop/catalog.ts` com validação Zod da resposta e `frontend/src/features/public-shop/CatalogueStep.tsx` com categorias, pesquisa, cartões, variantes, quantidades, preferências, subtotal, sem resultados, catálogo vazio, indisponibilidade, erro e opção explícita para continuar sem produtos.
- O `BookingWizard` integra o passo condicional e conserva o percurso normal de seis passos quando o catálogo não está activo. A Fase 4 acrescenta a transacção atómica do pedido; o gate global `VITE_SHOP_PUBLIC_CATALOG_ENABLED` continua desligado por defeito enquanto o schema de produção não estiver reconciliado.
- Migration `20261023120503_shop_public_catalog_phase3` aplicada ao staging; `supabase/tests/shop_public_catalog_phase3.sql` executado directamente com sucesso e `ROLLBACK`. O contrato foi acrescentado ao CI após os contratos SQL das Fases 1 e 2. A flag por tenant não foi activada e não foram aplicadas migrations à produção. A integração Git da Vercel publicou automaticamente o SHA inicial desta fase; a correcção seguinte desliga a query da loja por build até o backend estar reconciliado.
- O repositório passa a conter 134 ficheiros SQL de migration; staging tem 97 versões registadas e produção conserva 110. A divergência de histórico/schema continua aberta; estas contagens não demonstram equivalência.
- Relatório: [BARBEROS_SHOP_PHASE3_PUBLIC_CATALOG.md](BARBEROS_SHOP_PHASE3_PUBLIC_CATALOG.md). **A experiência pública e a transacção da Fase 4 estão no código; o lançamento continua NO-GO até à certificação e ao fecho da Fase 0.**

### Fase 4: pedido transaccional ligado à marcação

- Restaurado em `main` o ficheiro de migration `20261023124453_shop_order_atomic_phase4.sql`, correspondente à versão já registada em staging. Inclui o RPC transaccional, fingerprint de idempotência, leitura do pedido por token e ciclo de vida do pedido associado à marcação.
- `booking-create` valida linhas/quantidades/opções/modo de consumo, calcula fingerprint no servidor, rejeita reutilização de idempotency key com payload diferente e chama `book_appointment_with_shop_order_idempotent` quando há produtos. O percurso sem produtos mantém `book_appointment_idempotent` e consulta apenas `response`, compatível com o schema de produção actual. O cliente nunca envia preço ou total.
- O wizard envia variantes, quantidades, preferências e modo de consumo; limita a 20 variantes, suporta artigos “consumir aqui”/“levar consigo” e conserva a mesma chave para retry do mesmo payload, criando uma chave nova quando o payload muda.
- O token gateway disponibiliza o resumo persistido do pedido na página de gestão da marcação. A reserva de stock é criada na transacção e libertada quando a marcação é cancelada; preço, stock, tenant, publicação e opções são revalidados no servidor.
- `supabase/tests/shop_order_atomic_phase4.sql` cobre atomicidade, snapshot de preço, replay idempotente, alteração de fingerprint, tentativa de preço manipulado, falha de stock com rollback, cancelamento/libertação de reserva e privilégios. O CI inclui também um teste concorrente com duas sessões numa base local efémera.
- **Não activar em produção ainda:** o schema de produção não contém as tabelas/RPC da Loja nem o histórico necessário; o gate global Vercel continua desligado. Main terá 134 ficheiros SQL, staging tem 97 migrations registadas e produção 110, contagens que não provam equivalência.
- Relatório: [BARBEROS_SHOP_PHASE4_ATOMIC_ORDER.md](BARBEROS_SHOP_PHASE4_ATOMIC_ORDER.md). A Fase 4 está implementada no código versionado; a certificação ponta a ponta e a activação comercial continuam NO-GO até ao fecho dos gates de ambiente.

### Estado final da Fase 0

- **NO-GO para produção.** Permanecem por resolver as diferenças do histórico/schema de migrations, o desfasamento da Edge Function `booking-create`, a configuração Turnstile e a aceitação Phase 23 (runner Psycopg corrigido para `ClientCursor(conn)`, nova execução pendente). A Vercel publicou o SHA actual e o último gate Fast 3G passou no SHA `92fd645cbfaaabdf1ea8cc89c9facee1cd5d6b4f` com LCP 2.032/2.088 ms; a confirmação no SHA actual ainda está pendente. Os bloqueios e acções exactas estão em [BARBEROS_SHOP_PHASE0_READINESS.md](BARBEROS_SHOP_PHASE0_READINESS.md). Não declarar a Fase 0 concluída enquanto esses gates não tiverem evidência.

## Gates de preparação para produção ainda abertos

1. Reconciliar a sequência de migrations da main com o histórico real da produção antes de qualquer db push. Snapshot histórico após as Fases 1 e 2: 110 registos na produção, 93 no staging e 130 ficheiros SQL em `main`. Snapshot posterior após a Fase 3: 110 na produção, 95 no staging e 133 ficheiros SQL em `main`. Estes números não demonstram equivalência global. O staging também recebeu seis migrations aditivas de segurança/marcações sem reset nem remoção de dados: `20261023064854_resend_webhook_event_tracking`, `20261023065529_booking_rpc_idempotency_and_lockdown`, `20261023065622_booking_rate_limit_primitives`, `20261023065630_availability_week_batch_reconcile`, `20261023070321_token_rpc_lockdown_reconciliation` e `20261023070547_public_foreign_key_covering_indexes`. A migration de token foi aplicada depois de o `token-gateway` estar activo no staging; as RPCs de token deixam de estar directamente acessíveis a `anon` e `authenticated`. A migration de índices adicionou índices às foreign keys sem cobertura no schema presente do staging; a consulta de verificação devolveu zero foreign keys sem índice. A divergência histórica global continua aberta. Há quatro tabelas operacionais presentes apenas em produção (`support_tickets`, `platform_access_events`, `gmail_connections`, `gmail_oauth_states`) e a função de reconciliação `theme_engine_v2` não corresponde a um ficheiro de migration com o mesmo timestamp. Não executar reparação em lote nem aplicar migrations por suposição.
2. A suite Phase 23 usa uma base Supabase local efémera e `BARBEROS_TEST_DATABASE_URL` está definido no workflow. A última execução falhou em `manual_booking_phase11.sql` porque o cursor Psycopg dividiu um bloco `DO $`; `scripts/test_database_phase23.py` foi corrigido para usar `ClientCursor` e precisa de nova execução. O ciclo completo E2E autenticado ainda depende de secrets próprios. O contrato SQL de Phase 24 passou directamente no staging depois das correcções, mas não prova concorrência real entre duas sessões.
3. Verificar e documentar os segredos runtime necessários, incluindo TURNSTILE_SECRET_KEY, RATE_LIMIT_SALT, ALLOWED_ORIGINS, RESEND_API_KEY, RESEND_WEBHOOK_SECRET e NOTIFICATION_EMAIL_FROM. A enumeração das variáveis da Vercel não prova que os segredos Edge do Supabase estejam configurados.
4. O projecto BarberOS Remediation Staging conserva os dados existentes. As migrations aditivas estão aplicadas; os contratos SQL das Fases 1–4 passaram na CI principal. A suite Phase 23 ainda aguarda nova execução após correcção do executor Psycopg. As Edge Functions `resend-webhook`, `booking-create`, `token-gateway` e `health` estão activas em staging. Continuam por publicar e configurar `notify-dispatch` e as funções de pagamento/Gmail. O contrato SQL estático não substitui a aceitação real com duas sessões nem os testes HTTP completos.
5. A função `resend-webhook` e o RPC SQL estavam incompletos: `record_email_event` não existia no catálogo de produção nem de staging. O ledger de eventos/RPC está versionado e aplicado apenas no staging; o contrato de idempotência SQL passou. A função Edge está activa em staging, mas o teste HTTP sem assinatura devolveu `503 webhook unavailable`, confirmando que o segredo do webhook não está disponível para a função. Não foi possível provar um webhook assinado end-to-end porque as credenciais e o domínio remetente do Resend não puderam ser confirmados através das ferramentas disponíveis. A produção continua sem esta migration e sem a função publicada. Não declarar email de ponta a ponta funcional antes de validar assinatura com segredo real, entrega, bounce e complaint.
6. Não encontrei as variáveis VITE_TURNSTILE_SITE_KEY e VITE_BOOKING_TURNSTILE_REQUIRED na lista actual de variáveis da Vercel. A protecção anti-bot não deve ser activada em produção sem configurar e testar primeiro as chaves pública e privada.
7. A consulta do staging depois da migration de índices devolve zero foreign keys públicas sem índice de cobertura; a consulta de produção continua a identificar 19. Ainda é necessário aplicar os índices em produção através do release protegido, depois de reconciliar o histórico. Confirmar, sem expor valores, a rotação/revogação da antiga chave privilegiada que esteve no historial do Git; testar restauro de backup; verificar monitorização/alertas; medir performance Fast 3G; e organizar avaliação de segurança externa, teste em telemóveis reais e piloto com barbearia real.
8. Validar as integrações M-Pesa/e-Mola em ambiente de teste controlado antes de transacções reais. Não criar nem simular pagamentos reais como prova de sucesso.

A publicação do frontend não certifica estes gates. Até existirem provas de staging e dos providers, a produção deve ser tratada como operacionalmente não certificada para o primeiro cliente pagante.


### Fase 4: libertação de reservas

A validação em CI detectou que cancelar o pedido não libertava reservas. A migration aditiva `20261023133806_20261023134000_shop_order_reservation_release_phase4.sql` foi aplicada em staging e versionada em `main`. A suite completa será novamente executada sobre uma base efémera após a publicação deste commit.


### Actualização da Fase 4 e da aceitação (23 de Outubro de 2026)

- O commit `1279226d9f18c498b21211159cfdf94d472cfd6e` passou o workflow principal [39973135133](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39973135133): migrations desde base vazia, pgTAP, contratos SQL das Fases 1–4 e concorrência real em duas sessões.
- A suite Phase 23 falhou por erro de execução Psycopg num bloco SQL `DO $$`; a configuração do workflow já usa Supabase local efémero, não um secret externo em falta. O runner foi corrigido com `ClientCursor` e aguarda CI de confirmação.
- A medição Fast 3G mais recente passou no commit `92fd645cbfaaabdf1ea8cc89c9facee1cd5d6b4f`: LCP 2.032/2.088 ms; DCL 1.249/1.256 ms; CLS 0; INP 40/48 ms. O frontend permaneceu inalterado nos commits de fixtures SQL seguintes; a aprovação no SHA actual será confirmada na nova execução.
- A Vercel publicou o SHA actual e o smoke passou. Produção não contém o schema/RPC da Loja e não tem configuração Turnstile comprovada. A feature flag global e as flags por tenant permanecem desligadas; lançamento **NO-GO**.


### Correcção do contrato CRM na suite de aceitação

A suite Phase 23 já ultrapassa o parser SQL após a alteração para `ClientCursor(conn)`. A última falha foi em `customer_crm_phase12.sql`: a chamada para outro tenant foi correctamente bloqueada pelo guard de membership com `SHOP_OPERATOR_REQUIRED`, mas o teste esperava apenas `CUSTOMER_NOT_FOUND`. O contrato agora aceita ambas as recusas seguras. A nova execução do workflow é necessária antes de declarar a aceitação Phase 23 aprovada.


A suite Phase 23 ultrapassou o erro do executor e o contrato CRM após as correcções. O teste seguinte revelou que `waitlist_phase13.sql` invocava como `anon` RPCs que o próprio contrato correctamente restringe a `service_role`. Corrigimos o teste para reflectir o caminho real do token gateway, sem ampliar privilégios. A aceitação global depende da nova execução CI.


## Fase 5: fila operacional da Loja

- A fila /app/loja/pedidos apresenta pedidos reais por estado, permite aceitar, preparar, marcar pronto, atribuir um membro do tenant, guardar notas internas, assinalar artigos indisponíveis, cancelar com motivo e registar entregas completas ou parciais.
- A migration 20261026110000_shop_order_operations_phase5 cria a auditoria e as RPCs operacionais. A migration correctiva 20261026120000_shop_order_operations_hardening_phase5 é forward-only: fecha as transições de estado, impede repetição de movimentos com chave de operação, reconcilia reservas imutáveis durante entregas parciais, liberta reservas quando o pedido é cancelado ou falha e cobre FKs com índices.
- O contrato supabase/tests/shop_order_operations_phase5.sql é transaccional e reverte os fixtures. Cobre atribuição, entrega total com reserva de todo o stock, entrega parcial com repetição da mesma operação, saldo reservado, indisponibilidade, cancelamento e falha. É executado depois dos contratos de Fase 4 no CI.
- A suite scripts/test_booking_concurrency_phase23.py cria e remove o seu próprio tenant isolado. Não depende da suite anterior nem de seed.sql, e confirma que a segunda operação aguarda pelo lock antes de tentar reservar o mesmo slot.
- As migrations da Fase 5 e de hardening são aplicadas apenas ao staging. A produção não contém ainda o schema da Loja e a cadeia de migrations difere materialmente do staging. O gate da Fase 0 continua NO-GO: não aplicar a Fase 5 isoladamente em produção nem activar a Loja até à reconciliação completa do schema, runtime/handler, secrets e aceitação HTTP de produção.


## Actualização operacional da Fase 5, 26 de Outubro de 2026

- O contrato SQL da Fase 5 terminou sem erro SQL em staging; a verificação antes/depois encontrou zero fixtures `phase5-%` residuais. O contrato cobre entrega completa e parcial, repetição idempotente, reservas, indisponibilidade, recuperação, cancelamento, falha e chave de operação reutilizada.
- A página `/app/loja/pedidos` já inclui o selector real de responsável. Foi acrescentado um contrato de frontend para fixar a consulta de membros, o envio da atribuição e o bloqueio por tenant; o SQL também testa a rejeição de utilizadores que não pertencem à barbearia.
- A CI detectou duas migrations com o timestamp `20261026130000`. A migration de integridade foi renomeada para `20261026130100_shop_order_operations_integrity_phase5.sql`. A sequência completa desde uma base vazia passou no [run 40285662879](https://github.com/edmundokutuzov333/BarberOS/actions/runs/40285662879); a suite de aceitação SQL e Browser E2E passou no [run 40285662899](https://github.com/edmundokutuzov333/BarberOS/actions/runs/40285662899). A produção continua NO-GO até à reconciliação dos ambientes e aceitação HTTP/E2E de produção.
- A certificação da Fase 5 ainda não equivale a autorização de produção. As tabelas operacionais não existem em produção e o histórico remoto de staging não está alinhado com as migrations versionadas. Mantém-se NO-GO até reconciliação, verificação de runtime/Turnstile e aceitação HTTP/E2E. Ver [BARBEROS_SHOP_PHASE5_CERTIFICATION.md](BARBEROS_SHOP_PHASE5_CERTIFICATION.md).


## Fase 6: comunicações e relatórios da Loja (26 de Outubro de 2026)

- Migration forward-only `20261026150000_shop_communications_reporting_phase6.sql`: adiciona inbox de alertas internos com RLS, trigger transaccional para novo pedido e transições relevantes, RPC de relatório com tenant check, período limitado e datas interpretadas em `Africa/Maputo`.
- A interface `/app/loja/relatorios` apresenta alertas internos, estados de pedido, cumprimento por quantidades, stock baixo e cancelamentos; o gestor pode marcar alertas como lidos. A rota fica protegida pela regra de gestão da Loja e pela flag por tenant.
- Não são enviadas notificações externas. Email/WhatsApp só devem ser activados após configuração e teste do provider real; a tabela distingue canal e estado de entrega para não declarar sucesso sem confirmação.
- Receita paga é apresentada como indisponível enquanto não existir ligação verificada entre pagamentos reais e linhas de venda da Loja. Pedido ou entrega não são contados como receita.
- A migration ainda precisa de validação em base efémera/staging e não deve ser aplicada a produção até reconciliação do histórico e schema, conforme o gate da Fase 0.
