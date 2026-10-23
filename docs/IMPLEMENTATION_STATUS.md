# BarberOS — estado das 10 fases

## Implementado no repositório

- Gateway público `/`, escolha cliente/gestão, links curtos `/b/:slug` e QR scanner lazy.
- Booking público via Edge Function, idempotência, rate limits, Turnstile, CORS por allowlist e revogação de DML público sensível.
- Email-first: fila de notificações, retries classificados, webhook Resend e preferência de canais persistida.
- Disponibilidade semanal via RPC batch com cache/refetch no cliente.
- O formulário público aceita telefone sem exigir email; se não houver email, o cliente é instruído a guardar o link de gestão apresentado no fim. A entrega automática continua dependente dos providers e segredos activos.
- Em builds de produção, a marcação exige a chave pública e o token Turnstile. Se a chave não estiver configurada, a UI bloqueia a submissão e explica a indisponibilidade, em vez de deixar o cliente avançar para uma chamada que o backend irá rejeitar.
- PWA instalável, service worker, manifest, i18n (pt-MZ, pt-PT, pt-BR, en, es) e páginas de privacidade/termos.
- Fundamentos de CRM/privacy: consentimento, anonymização, exportação de dados e índices de retenção.
- Fundamentos de escala: convites, portfólio, produtos, movimentos de stock, chaves API, webhooks, deliveries e push subscriptions.
- Healthcheck Edge Function, contrato de deploy, scan de secrets e CI consolidado para lint, typecheck, testes, build e budget.

## Gates de preparação para produção ainda abertos

1. Reconciliar a sequência de migrations da main com o histórico real da produção antes de qualquer db push. O Supabase de produção regista 110 migrations; o repositório tem 112 ficheiros SQL. A migration registada como theme_engine_v2 no Supabase não tem um ficheiro correspondente com esse timestamp no repositório. Não executar reparação em lote nem aplicar migrations por suposição.
2. Provisionar um endpoint e segredo dedicados para a aceitação no GitHub Actions. As execuções de 23 de Outubro de 2026 falharam explicitamente porque BARBEROS_TEST_DATABASE_URL chegou vazio; por isso concorrência e performance na base de dados continuam por certificar.
3. Verificar e documentar os segredos runtime necessários, incluindo TURNSTILE_SECRET_KEY, RATE_LIMIT_SALT, ALLOWED_ORIGINS, RESEND_API_KEY, RESEND_WEBHOOK_SECRET e NOTIFICATION_EMAIL_FROM. A enumeração das variáveis da Vercel não prova que os segredos Edge do Supabase estejam configurados.
4. O projecto BarberOS Remediation Staging existe, mas é preciso provar que o schema, o histórico de migrations e as Edge Functions de staging correspondem à versão candidata, e executar booking, idempotência, conflito, expiração de token e notificações nesse ambiente.
5. A função resend-webhook está versionada no repositório, mas não aparece no inventário actual de Edge Functions de produção. Não declarar email de ponta a ponta funcional até publicar e validar a função, assinatura do webhook e domínio remetente.
6. Não encontrei as variáveis VITE_TURNSTILE_SITE_KEY e VITE_BOOKING_TURNSTILE_REQUIRED na lista actual de variáveis da Vercel. A protecção anti-bot não deve ser activada em produção sem configurar e testar primeiro as chaves pública e privada.
7. Confirmar, sem expor valores, a rotação/revogação da antiga chave privilegiada que esteve no historial do Git; testar restauro de backup; verificar monitorização/alertas; medir performance Fast 3G; e organizar avaliação de segurança externa, teste em telemóveis reais e piloto com barbearia real.
8. Validar as integrações M-Pesa/e-Mola em ambiente de teste controlado antes de transacções reais. Não criar nem simular pagamentos reais como prova de sucesso.

A publicação do frontend não certifica estes gates. Até existirem provas de staging e dos providers, a produção deve ser tratada como operacionalmente não certificada para o primeiro cliente pagante.
