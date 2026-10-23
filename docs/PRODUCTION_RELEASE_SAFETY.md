# BarberOS — segurança de releases Supabase

Estado verificado em 23 de Outubro de 2026: a produção continua sem certificação para receber migrações de main.

Relatório actualizado da auditoria da Loja da Barbearia: [BARBEROS_SHOP_PHASE0_READINESS.md](BARBEROS_SHOP_PHASE0_READINESS.md). O gate da Fase 0 permanece bloqueado.

## Bloqueios verificados

- Snapshot actualizado após a Fase 3, em 23 de Outubro de 2026: 110 versões de migrations na produção, 95 no projecto BarberOS Remediation Staging e 132 ficheiros SQL em `main` em `supabase/migrations`. As contagens não provam equivalência semântica e não devem ser reconciliadas por contagem.
- O histórico de produção inclui `20261021141221 theme_engine_v2`, sem ficheiro SQL correspondente na árvore actual. O staging mais recente termina em `20261023070547 public_foreign_key_covering_indexes` e contém também uma versão `theme_engine_v2` com o timestamp `20261021132342`. É necessário mapear cada versão remota para o SQL correspondente e rever o esquema real, sem `migration repair` em lote nem edição manual do histórico.
- Por isso, executar supabase db push contra a produção antes de reconciliar o histórico pode tentar reaplicar migrações antigas. A validação --dry-run não é uma prova de equivalência semântica do esquema.
- A RPC get_payment_runtime_for_token(uuid) devolve dados internos de runtime do provider e estava executável por anon e authenticated. A migração 20261019160000_payment_rpc_privilege_lockdown.sql revoga esses grants e conserva o acesso do service_role.
- O wizard já tem o ponto de integração para Cloudflare Turnstile, mas a chave pública VITE_TURNSTILE_SITE_KEY ainda tem de ser configurada no Vercel; a chave privada TURNSTILE_SECRET_KEY tem de estar configurada nos secrets Edge do Supabase. O bypass Turnstile não pode ser usado no projecto de produção.
- A aceitação de concorrência e a performance SQL continuam por certificar: os workflows falham explicitamente porque `BARBEROS_TEST_DATABASE_URL` está vazio nos GitHub Actions. O staging existe, mas ainda não está comprovadamente alinhado com a cadeia de migrations da versão candidata. A função `resend-webhook` também não consta do inventário de funções activas de produção.

## Política de release

O workflow .github/workflows/deploy-supabase.yml já não é disparado por pushes a main. Passa a exigir execução manual, frase de confirmação APPLY-SUPABASE-PRODUCTION e duas variáveis GitHub:

- BARBEROS_PRODUCTION_MIGRATION_HISTORY_RECONCILED=true: só definir quando cada migração local tiver sido reconciliada com o histórico remoto e as diferenças de esquema tiverem sido revistas.
- BARBEROS_TURNSTILE_CONFIGURED=true: só definir após configurar e validar a chave pública no Vercel e a chave privada no Supabase, sem activar TURNSTILE_BYPASS em produção.

A ausência destas variáveis faz o workflow falhar de forma explícita, em vez de terminar com SKIP e código zero. A existência das variáveis é uma declaração operacional, não substitui os logs reais de staging.

## Sequência obrigatória antes da produção

1. Usar o projecto isolado já existente `BarberOS Remediation Staging` e verificar a sua cadeia de migrations, esquema e Edge Functions contra `main`. Não o considerar aceite apenas por estar activo.
2. Reconstruir o mapa de histórico: para cada linha em supabase_migrations.schema_migrations, identificar o ficheiro SQL correspondente e verificar se o seu conteúdo coincide com o que já foi aplicado. Não executar reparações em lote nem editar a tabela de histórico manualmente.
3. Aplicar em staging as migrações pendentes e executar os contratos SQL de segurança, testes de booking concorrente, testes de gestão por token e testes de notificações.
4. Configurar Turnstile e Resend em staging. Testar uma reserva real controlada, replay de idempotency key, dois pedidos para o mesmo slot, confirmação de email e webhook assinado.
5. Só depois de os testes passarem, libertar primeiro o esquema compatível e as Edge Functions; confirmar a versão activa e as permissões; por último, publicar o frontend que depende das novas funções.
6. Após o release, repetir as consultas de privilégios e o fluxo ponta a ponta em produção com dados de teste autorizados. Remover/limpar esses dados segundo a política de retenção.
7. A monitorização agendada verifica a superfície pública e os endpoints de saúde. O resultado falhado fica registado no GitHub Actions; não equivale a alerta SMS nem substitui monitorização externa independente.

Não marcar a Fase 3 ou Fase 4 como concluída enquanto a execução real em staging e as verificações acima não estiverem registadas.
