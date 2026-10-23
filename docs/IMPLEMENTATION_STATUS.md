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

## Gates de preparação para produção ainda abertos

1. Reconciliar a sequência de migrations da main com o histórico real da produção antes de qualquer db push. O inventário de 23 de Outubro de 2026 mostrava 110 registos em produção, 75 em staging e 112 ficheiros SQL na main antes desta correcção. O staging recebeu a migration aditiva `20261023064854_resend_webhook_event_tracking` sem reinício nem remoção de dados; a divergência histórica global continua aberta. Há quatro tabelas operacionais presentes apenas em produção (`support_tickets`, `platform_access_events`, `gmail_connections`, `gmail_oauth_states`) e a função de reconciliação `theme_engine_v2` não corresponde a um ficheiro de migration com o mesmo timestamp. Não executar reparação em lote nem aplicar migrations por suposição.
2. Provisionar um endpoint e segredo dedicados para a aceitação no GitHub Actions. As execuções de 23 de Outubro de 2026 falharam explicitamente porque BARBEROS_TEST_DATABASE_URL chegou vazio; por isso concorrência e performance na base de dados continuam por certificar.
3. Verificar e documentar os segredos runtime necessários, incluindo TURNSTILE_SECRET_KEY, RATE_LIMIT_SALT, ALLOWED_ORIGINS, RESEND_API_KEY, RESEND_WEBHOOK_SECRET e NOTIFICATION_EMAIL_FROM. A enumeração das variáveis da Vercel não prova que os segredos Edge do Supabase estejam configurados.
4. O projecto BarberOS Remediation Staging existe e conserva dados. A migration de eventos Resend foi aplicada e validada de forma isolada, mas o ambiente completo continua divergente: antes da migration aditiva faltavam quatro tabelas face à produção e não havia Edge Functions registadas. Ainda é necessário reconciliar o schema sem reset, publicar as funções dependentes e executar booking, idempotência, conflito, expiração de token e notificações nesse ambiente.
5. A função `resend-webhook` e o RPC SQL estavam incompletos: a função chamava `record_email_event`, que não existia no catálogo de rotinas de produção nem de staging. A migration aditiva e os testes do contrato foram acrescentados; a função Edge ainda precisa de ser publicada no ambiente correcto e testada com um segredo Svix de teste. Falta confirmar a identidade/domínio remetente no Resend e observar um evento real de entrega, bounce e complaint. Não declarar email de ponta a ponta funcional antes dessas verificações.
6. Não encontrei as variáveis VITE_TURNSTILE_SITE_KEY e VITE_BOOKING_TURNSTILE_REQUIRED na lista actual de variáveis da Vercel. A protecção anti-bot não deve ser activada em produção sem configurar e testar primeiro as chaves pública e privada.
7. Confirmar, sem expor valores, a rotação/revogação da antiga chave privilegiada que esteve no historial do Git; testar restauro de backup; verificar monitorização/alertas; medir performance Fast 3G; e organizar avaliação de segurança externa, teste em telemóveis reais e piloto com barbearia real.
8. Validar as integrações M-Pesa/e-Mola em ambiente de teste controlado antes de transacções reais. Não criar nem simular pagamentos reais como prova de sucesso.

A publicação do frontend não certifica estes gates. Até existirem provas de staging e dos providers, a produção deve ser tratada como operacionalmente não certificada para o primeiro cliente pagante.
