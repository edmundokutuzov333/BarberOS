# BarberOS — estado das 10 fases

## Implementado no repositório

- Gateway público `/`, escolha cliente/gestão, links curtos `/b/:slug` e QR scanner lazy.
- Booking público via Edge Function, idempotência, rate limits, Turnstile, CORS por allowlist e revogação de DML público sensível.
- Email-first: fila de notificações, retries classificados, webhook Resend e preferência de canais persistida.
- Disponibilidade semanal via RPC batch com cache/refetch no cliente.
- PWA instalável, service worker, manifest, i18n (pt-MZ, pt-PT, pt-BR, en, es) e páginas de privacidade/termos.
- Fundamentos de CRM/privacy: consentimento, anonymização, exportação de dados e índices de retenção.
- Fundamentos de escala: convites, portfólio, produtos, movimentos de stock, chaves API, webhooks, deliveries e push subscriptions.
- Healthcheck Edge Function, contrato de deploy, scan de secrets e CI consolidado para lint, typecheck, testes, build e budget.

## Bloqueios que não podem ser certificados sem acessos

1. Aplicar as migrações no projeto Supabase e regenerar `database.types.ts` a partir do schema real.
2. Configurar `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_SALT`, `ALLOWED_ORIGINS`, Resend e URL pública nos secrets de runtime.
3. Configurar secrets GitHub/Vercel/Supabase e executar o deploy de funções e frontend.
4. Validar staging e produção: booking real, callback Resend, pagamentos, smoke E2E, healthcheck e observabilidade.
5. Ativar DNS/DMARC/SPF/DKIM do email e medir os budgets de performance na URL pública.

O código e os contratos estão preparados, mas estes gates externos são deliberadamente deixados pendentes até os acessos serem fornecidos.
