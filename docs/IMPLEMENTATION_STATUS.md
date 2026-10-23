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
- O gestor pode criar/editar produtos, gerir categorias, variantes, preços, estado de publicação, metadados e upload de imagem, pré-visualizar a ficha, ajustar stock através da RPC `record_shop_inventory_movement` e consultar movimentos e auditoria.
- A publicação é validada no PostgreSQL: não é permitido publicar produto sem variante activa nem com categoria inactiva. A imagem exige texto alternativo e origem/autorização. A feature flag desligada continua a impedir exposição pública.
- As permissões SQL da Fase 2 permitem actualizar apenas as colunas comerciais necessárias. A escrita directa de `stock_on_hand` permanece proibida; as alterações passam pelo ledger. `image_source_checked_at`, `image_authorized_by` e `image_authorized_at` são campos geridos pelo PostgreSQL. As migrations da Fase 2 e o teste `supabase/tests/shop_catalog_phase2.sql` foram aplicados/executados em staging.
- Relatório técnico: [BARBEROS_SHOP_PHASE2_CATALOG.md](BARBEROS_SHOP_PHASE2_CATALOG.md).

### Estado final da Fase 0

- **NO-GO para produção.** Permanecem por resolver as diferenças do histórico/schema de migrations, o desfasamento da Edge Function `booking-create`, a configuração Turnstile, o secret `BARBEROS_TEST_DATABASE_URL` e as credenciais de deployment da Vercel. Os bloqueios e acções exactas estão em [BARBEROS_SHOP_PHASE0_READINESS.md](BARBEROS_SHOP_PHASE0_READINESS.md). Não declarar a Fase 0 concluída enquanto esses gates não tiverem evidência.

## Gates de preparação para produção ainda abertos

1. Reconciliar a sequência de migrations da main com o histórico real da produção antes de qualquer db push. A contagem verificada após as Fases 1 e 2 é 110 registos na produção, 91 no staging e 128 ficheiros SQL em `main`. O baseline histórico de 23 de Outubro era inferior; as migrations de Loja foram aplicadas apenas no staging e não demonstram equivalência global. O staging também recebeu seis migrations aditivas de segurança/marcações sem reset nem remoção de dados: `20261023064854_resend_webhook_event_tracking`, `20261023065529_booking_rpc_idempotency_and_lockdown`, `20261023065622_booking_rate_limit_primitives`, `20261023065630_availability_week_batch_reconcile`, `20261023070321_token_rpc_lockdown_reconciliation` e `20261023070547_public_foreign_key_covering_indexes`. A migration de token foi aplicada depois de o `token-gateway` estar activo no staging; as RPCs de token deixam de estar directamente acessíveis a `anon` e `authenticated`. A migration de índices adicionou índices às foreign keys sem cobertura no schema presente do staging; a consulta de verificação devolveu zero foreign keys sem índice. A divergência histórica global continua aberta. Há quatro tabelas operacionais presentes apenas em produção (`support_tickets`, `platform_access_events`, `gmail_connections`, `gmail_oauth_states`) e a função de reconciliação `theme_engine_v2` não corresponde a um ficheiro de migration com o mesmo timestamp. Não executar reparação em lote nem aplicar migrations por suposição.
2. Provisionar um endpoint e segredo dedicados para a aceitação no GitHub Actions. A execução mais recente da suite da Fase 23 falhou explicitamente porque `BARBEROS_TEST_DATABASE_URL` chegou vazio; a concorrência HTTP também continua bloqueada pelos respectivos inputs ausentes. O contrato SQL de Phase 24 passou directamente no staging depois das correcções, mas não prova concorrência real entre duas sessões.
3. Verificar e documentar os segredos runtime necessários, incluindo TURNSTILE_SECRET_KEY, RATE_LIMIT_SALT, ALLOWED_ORIGINS, RESEND_API_KEY, RESEND_WEBHOOK_SECRET e NOTIFICATION_EMAIL_FROM. A enumeração das variáveis da Vercel não prova que os segredos Edge do Supabase estejam configurados.
4. O projecto BarberOS Remediation Staging conserva os dados existentes. As seis migrations aditivas acima estão aplicadas; o contrato SQL Phase 24 foi executado directamente no staging e agora passa, depois de detectar e corrigir a execução pública indevida de `book_appointment`, a ausência da tabela `booking_idempotency`, do RPC idempotente e dos primitivos de rate limit. O RPC de disponibilidade semanal também está presente e os privilégios foram verificados. As Edge Functions `resend-webhook`, `booking-create`, `token-gateway` e `health` estão activas em staging. Continuam por publicar e configurar `notify-dispatch` e as funções de pagamento/Gmail. O contrato SQL estático não substitui a aceitação real com duas sessões nem os testes HTTP completos.
5. A função `resend-webhook` e o RPC SQL estavam incompletos: `record_email_event` não existia no catálogo de produção nem de staging. O ledger de eventos/RPC está versionado e aplicado apenas no staging; o contrato de idempotência SQL passou. A função Edge está activa em staging, mas o teste HTTP sem assinatura devolveu `503 webhook unavailable`, confirmando que o segredo do webhook não está disponível para a função. Não foi possível provar um webhook assinado end-to-end porque as credenciais e o domínio remetente do Resend não puderam ser confirmados através das ferramentas disponíveis. A produção continua sem esta migration e sem a função publicada. Não declarar email de ponta a ponta funcional antes de validar assinatura com segredo real, entrega, bounce e complaint.
6. Não encontrei as variáveis VITE_TURNSTILE_SITE_KEY e VITE_BOOKING_TURNSTILE_REQUIRED na lista actual de variáveis da Vercel. A protecção anti-bot não deve ser activada em produção sem configurar e testar primeiro as chaves pública e privada.
7. A consulta do staging depois da migration de índices devolve zero foreign keys públicas sem índice de cobertura; a consulta de produção continua a identificar 19. Ainda é necessário aplicar os índices em produção através do release protegido, depois de reconciliar o histórico. Confirmar, sem expor valores, a rotação/revogação da antiga chave privilegiada que esteve no historial do Git; testar restauro de backup; verificar monitorização/alertas; medir performance Fast 3G; e organizar avaliação de segurança externa, teste em telemóveis reais e piloto com barbearia real.
8. Validar as integrações M-Pesa/e-Mola em ambiente de teste controlado antes de transacções reais. Não criar nem simular pagamentos reais como prova de sucesso.

A publicação do frontend não certifica estes gates. Até existirem provas de staging e dos providers, a produção deve ser tratada como operacionalmente não certificada para o primeiro cliente pagante.
