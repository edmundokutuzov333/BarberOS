# BarberOS — segurança de releases Supabase

Estado em 19 de Outubro de 2026: a produção não está certificada para receber migrações de main.

## Bloqueios verificados

- A base activa regista 97 migrações, até 20260919005227 release_audit_appointments_read_model; main contém 97 ficheiros, incluindo migrações de 18/19 de Outubro.
- Os timestamps das migrações locais e os version registados no Supabase divergem. Só 54 dos 97 timestamps locais coincidem exactamente com um version remoto e sete registos remotos não encontram correspondência directa pelo nome com os ficheiros actuais. Parte do SQL foi aplicada com versões de execução diferentes dos timestamps originais; outros registos exigem reconciliação individual.
- Por isso, executar supabase db push contra a produção antes de reconciliar o histórico pode tentar reaplicar migrações antigas. A validação --dry-run não é uma prova de equivalência semântica do esquema.
- A RPC get_payment_runtime_for_token(uuid) devolve dados internos de runtime do provider e estava executável por anon e authenticated. A migração 20261019160000_payment_rpc_privilege_lockdown.sql revoga esses grants e conserva o acesso do service_role.
- O wizard já tem o ponto de integração para Cloudflare Turnstile, mas a chave pública VITE_TURNSTILE_SITE_KEY ainda tem de ser configurada no Vercel; a chave privada TURNSTILE_SECRET_KEY tem de estar configurada nos secrets Edge do Supabase. O bypass Turnstile não pode ser usado no projecto de produção.
- A validação de concorrência, booking real e entrega Resend ainda não foi comprovada em staging nesta ronda.

## Política de release

O workflow .github/workflows/deploy-supabase.yml já não é disparado por pushes a main. Passa a exigir execução manual, frase de confirmação APPLY-SUPABASE-PRODUCTION e duas variáveis GitHub:

- BARBEROS_PRODUCTION_MIGRATION_HISTORY_RECONCILED=true: só definir quando cada migração local tiver sido reconciliada com o histórico remoto e as diferenças de esquema tiverem sido revistas.
- BARBEROS_TURNSTILE_CONFIGURED=true: só definir após configurar e validar a chave pública no Vercel e a chave privada no Supabase, sem activar TURNSTILE_BYPASS em produção.

A ausência destas variáveis faz o workflow falhar de forma explícita, em vez de terminar com SKIP e código zero. A existência das variáveis é uma declaração operacional, não substitui os logs reais de staging.

## Sequência obrigatória antes da produção

1. Criar um ambiente Supabase isolado e confirmar que as migrações aplicam sem erros. A criação de uma branch de desenvolvimento foi cotada em US$ 0,01344/hora; não foi criada nesta ronda porque exige autorização explícita de custo.
2. Reconstruir o mapa de histórico: para cada linha em supabase_migrations.schema_migrations, identificar o ficheiro SQL correspondente e verificar se o seu conteúdo coincide com o que já foi aplicado. Não executar reparações em lote nem editar a tabela de histórico manualmente.
3. Aplicar em staging as migrações pendentes e executar os contratos SQL de segurança, testes de booking concorrente, testes de gestão por token e testes de notificações.
4. Configurar Turnstile e Resend em staging. Testar uma reserva real controlada, replay de idempotency key, dois pedidos para o mesmo slot, confirmação de email e webhook assinado.
5. Só depois de os testes passarem, libertar primeiro o esquema compatível e as Edge Functions; confirmar a versão activa e as permissões; por último, publicar o frontend que depende das novas funções.
6. Após o release, repetir as consultas de privilégios e o fluxo ponta a ponta em produção com dados de teste autorizados. Remover/limpar esses dados segundo a política de retenção.

Não marcar a Fase 3 ou Fase 4 como concluída enquanto a execução real em staging e as verificações acima não estiverem registadas.
