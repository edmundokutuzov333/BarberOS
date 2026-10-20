# BarberOS: segurança dos releases Supabase

Estado verificado em 20 de Outubro de 2026. **A produção continua bloqueada para aplicação de migrations até à reconciliação do histórico e à certificação de staging.** As consultas desta auditoria foram apenas de leitura; não foram aplicadas migrations, alterados grants ou modificados dados de produção.

## Inventário remoto observado

- O projecto Supabase `alseiinjzwjdiwtvkdzy` está `ACTIVE_HEALTHY`, em `eu-west-2`, com PostgreSQL 17.
- A tabela remota `supabase_migrations.schema_migrations` contém 107 registos, do version `20260918132000` até `20261020063931`.
- O histórico não pode ser considerado reconciliado só por causa desta contagem. A comparação exacta de cada version, nome e conteúdo SQL local/remoto continua por executar. A auditoria anterior documentou timestamps divergentes e versões remotas sem correspondência directa pelo nome; essas diferenças exigem revisão individual.
- **Não executar** `supabase db push`, `supabase migration repair` nem editar manualmente `supabase_migrations.schema_migrations` na produção para silenciar diferenças. Um `--dry-run` não prova equivalência semântica do esquema.
- A lista de Edge Functions publicada inclui `booking-create` v1, `token-gateway` v1, `health` v1, `notify-dispatch` v4, `barber-assets` v2, `admin-credential-manager` v5 e as cinco funções `payments-*` (configuração v2, initiate v2, status v2, webhook v2, reconcile v2). **A função local `resend-webhook` não aparece no inventário remoto observado.** Portanto, o webhook de entrega do Resend não está comprovado como publicado.
- Consultas SQL read-only confirmaram RLS activo nas tabelas públicas inspeccionadas. Isso não basta para certificar isolamento multi-tenant: é preciso avaliar expressões de cada policy, grants, funções `SECURITY DEFINER`, e testes entre contas/tenants.
- As funções `get_payment_runtime_for_token(uuid)`, `get_payment_status_by_token(uuid)`, `init_payment_from_token(...)` e `book_appointment(...)` tinham ACL limitada a `postgres` e `service_role` na consulta realizada. As rotinas públicas de consulta de loja e disponibilidade, assim como as rotinas de gestão por token, têm grants de cliente que precisam de continuar protegidos pelas respectivas validações.
- A migração `20261019160000_payment_rpc_privilege_lockdown.sql` e o reforço do booking devem ser avaliados em staging; não se deve reverter as permissões públicas como solução de rollback.

## Bloqueios operacionais

- A aceitação SQL, a concorrência real das marcações e o benchmark SQL de desempenho ainda não foram certificados num ambiente dedicado. Os workflows existentes falharam de forma fechada porque `BARBEROS_TEST_DATABASE_URL` estava vazia.
- O benchmark público Fast 3G excedeu o orçamento LCP de 2500 ms. Os relatórios observados têm LCP de 2540 a 2812 ms; DCL ficou perto de 1250 ms, CLS foi 0 e a roundtrip do RPC público ficou aproximadamente entre 300 e 540 ms. Isto aponta para trabalho de renderização/pintura da página pública, não demonstra lentidão SQL do mesmo grau. É necessário corrigir e voltar a medir sem alargar o limite do teste.
- O workflow de produção Vercel não completou a parte de deploy/smoke porque os segredos de CI do Vercel não estavam configurados nesse workflow. Um deployment READY observado no Vercel prova publicação do artefacto, não a certificação de ponta a ponta dos fluxos autenticados.
- A presença de código de M-Pesa/e-Mola não prova que um provider esteja operacional. Faltam provas registadas de chamadas em sandbox, callbacks assinados, idempotência, transições de estado e reconciliação.
- As configurações e valores dos secrets de produção não devem ser impressos ou copiados para logs. É necessário confirmar nomes presentes e validar cada integração através de requests de teste em staging, sem revelar valores.
- Backup e restauro real, assim como rollback coordenado entre frontend, Edge Functions e esquema, continuam por ensaiar. Reverter o deployment Vercel não reverte alterações de base de dados.

## Política de release

O workflow `.github/workflows/deploy-supabase.yml` é manual e exige a frase `APPLY-SUPABASE-PRODUCTION`, bem como as variáveis:

- `BARBEROS_PRODUCTION_MIGRATION_HISTORY_RECONCILED=true`, apenas quando cada versão remota e migration local tiver sido reconciliada e as diferenças de esquema revistas.
- `BARBEROS_TURNSTILE_CONFIGURED=true`, após validar a chave pública `VITE_TURNSTILE_SITE_KEY` e `VITE_BOOKING_TURNSTILE_REQUIRED=true` no Vercel e `TURNSTILE_SECRET_KEY` no Supabase.
- `BARBEROS_RESEND_CONFIGURED=true`, após validar a identidade remetente, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, publicação do endpoint webhook e teste de assinatura.
- `BARBEROS_STAGING_VERIFIED=true`, apenas depois da execução real da suite em ambiente isolado.

Os nomes/valores das variáveis de gate são declarações operacionais e não substituem relatórios, traces e resultados reais de staging.

## Sequência obrigatória

1. Aplicar a cadeia completa num Supabase local descartável e executar contratos de segurança, suite de aceitação, concorrência e contratos de desempenho. O novo workflow `.github/workflows/phase27-release-certification.yml` executa estes testes sem precisar de uma base de dados cloud paga.
2. Executar em ambiente local/resetável os percursos de registo, onboarding/publicação, marcação pública, agenda, reagendamento, cancelamento e isolamento entre duas contas. Testar auth por e-mail e permissões com fixtures exclusivos de QA.
3. Comparar os 107 registos remotos observados com todos os ficheiros de `supabase/migrations`. Identificar divergências por version/nome/conteúdo e preparar um manifesto aprovado. Não corrigir histórico por aproximação.
4. Validar grants e RLS por papel (anon, authenticated e service_role), as policies por tenant, e as Edge Functions publicadas, especialmente `booking-create`, `token-gateway`, `notify-dispatch`, `resend-webhook` e `payments-*`.
5. Resolver LCP Fast 3G e repetir os benchmarks. O orçamento continua `LCP <= 2500 ms`; não transformar uma falha em sucesso ajustando o limite.
6. Ensaiar pagamentos e notificações em sandbox, incluindo callback assinado, duplicado, atrasado, falhado e reconciliação. Não anunciar método de pagamento sem evidência do ciclo completo.
7. Exportar uma cópia consistente, restaurá-la num ambiente isolado e medir o tempo de recuperação. Documentar dono, RPO/RTO, procedimento de rollback do frontend, procedimento separado de rollback/reparação de schema e critérios de abortar.
8. Só após a evidência acima ser revista se deve planear um release de produção, com backup recente, janela e plano de reversão.

Não marcar a certificação de produção ou o lançamento comercial como concluídos enquanto alguma prova obrigatória estiver em falta.
