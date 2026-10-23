# BarberOS | Relatório de prontidão da Fase 0: Loja da Barbearia

**Data da verificação:** 23 de Outubro de 2026  
**Repositório:** [edmundokutuzov333/BarberOS](https://github.com/edmundokutuzov333/BarberOS)  
**Branch auditada:** `main`  
**Commit de referência da auditoria:** [`afa2788c2a2884cfa4e331218c1468578712f4a0`](https://github.com/edmundokutuzov333/BarberOS/commit/afa2788c2a2884cfa4e331218c1468578712f4a0)  
**Estado actualizado após a implementação das Fases 1 e 2 em staging:** **NO-GO para produção.** O catálogo de gestão pode ser preparado em staging atrás da flag desligada, mas não ligar o fluxo público nem associar pedidos à criação de marcações até a reconciliação de produção e a aceitação real serem comprovadas.

## 1. Resumo executivo

A especificação da Loja da Barbearia define uma pré-encomenda opcional, ligada à marcação existente. Não é um marketplace nem uma loja independente. O cliente pode pedir artigos para consumo no local ou compra para levar; pedido, preparação, entrega e pagamento têm estados separados. Cada barbearia controla o seu catálogo, preços, variantes e stock.

A Fase 0 exigia reconciliar os bloqueios do motor de marcações, comparar produção com staging, verificar migrations, RLS, secrets e a Edge Function `booking-create`, definir a flag da loja desligada por defeito e preparar um plano de reversão.

A consulta directa aos ambientes encontrou diferenças materiais entre o código, o staging e a produção. A produção não contém a tabela e a RPC de idempotência usadas pela implementação actual de `main`; a função `booking-create` publicada não contém os controlos presentes no código versionado nem no handler de staging. A chave pública do Turnstile e a variável que o torna obrigatório não aparecem na lista de variáveis de ambiente visíveis da Vercel. A suite de aceitação com base de dados dedicada continua sem execução válida.

**Decisão:** manter a Loja da Barbearia indisponível ao público. As migrations das Fases 1 e 2 foram aplicadas apenas no staging e estão versionadas em `main`. Não alterar o schema de produção, não publicar uma nova Edge Function de marcações e não activar o rollout enquanto os bloqueios abaixo não forem resolvidos e comprovados.

## 2. Âmbito e limites da execução

Foram efectuadas leituras do repositório e consultas de leitura aos ambientes Supabase e Vercel. Foram consultados o estado de `main`, a documentação de release, as migrations, o schema público, os privilégios de RPC, o inventário das Edge Functions, os nomes das variáveis de ambiente visíveis e os resultados recentes de CI.

Na Fase 0 não foram feitas alterações de schema, dados, grants ou secrets na produção. Não houve reset de bases de dados, não foi publicada nenhuma Edge Function de marcações e não foi criada uma marcação fictícia. As migrations da loja foram aplicadas apenas no staging, como trabalho posterior das Fases 1 e 2. Os testes que exigem credenciais e uma base de dados dedicada não foram contornados.

Os secrets de runtime do Supabase não puderam ser inspeccionados directamente através das ferramentas de consulta disponíveis nesta sessão. A presença de um nome de variável na Vercel não prova a presença desse segredo no runtime das Edge Functions.

## 3. Evidência verificada

| Área | Evidência observada | Estado |
|---|---|---|
| GitHub | `main` apontava para o commit de referência acima no início da auditoria. A comparação confirmou que esse commit era idêntico à referência de `main` no momento da leitura. | Confirmado para a referência inicial. |
| Migrations | `main` contém 118 ficheiros SQL. A produção regista 110 versões; o staging regista 81. As contagens não demonstram equivalência semântica. | Bloqueado. |
| Schema | `public.booking_idempotency` e a RPC `book_appointment_idempotent` existem no staging, mas não existem na produção. | Bloqueio crítico. |
| Handler de marcações | A Edge Function `booking-create` da produção não contém a validação Turnstile, os primitivos de rate limit nem o caminho idempotente encontrados no código de `main` e no handler de staging. | Bloqueio crítico. |
| Privilégios de marcação | A RPC antiga `book_appointment` não pode ser executada por `anon` nem `authenticated` na produção; o papel `service_role` mantém acesso. A RPC idempotente usada pelo código actual não existe na produção. | Contenção parcial confirmada, integração não certificada. |
| Turnstile na Vercel | A listagem actual de variáveis visíveis não inclui `VITE_TURNSTILE_SITE_KEY` nem `VITE_BOOKING_TURNSTILE_REQUIRED`. O wizard versionado bloqueia a submissão em produção quando a chave pública não está configurada. | Bloqueio crítico para a marcação pública. |
| Edge Functions | Produção: `booking-create v1`, `health v1` e `token-gateway v1` activas; `resend-webhook` ausente. Staging: `booking-create v1`, `health v1`, `token-gateway v1` e `resend-webhook v1` activas. | Divergência entre ambientes. |
| Tabelas públicas | 24 tabelas listadas na produção e 22 no staging. Quatro tabelas operacionais estão apenas na produção: `support_tickets`, `platform_access_events`, `gmail_connections` e `gmail_oauth_states`. O staging contém `resend_email_events` e `booking_idempotency`, que não estão na produção. | Reconciliar antes de qualquer release de schema. |
| RLS | RLS está activada em todas as tabelas públicas devolvidas pela listagem. O advisor assinala tabelas sem políticas e funções SECURITY DEFINER acessíveis por alguns papéis; cada caso precisa de revisão pelo contrato e pelo corpo da função. | Revisão selectiva necessária. |
| Flag da loja | Não foi encontrada a coluna `shop_enabled`, a tabela de catálogo da loja ou a rota de gestão `/app/loja` no repositório auditado. | Não implementada; deve permanecer desligada por ausência da funcionalidade. |
| Vercel | A deployment de produção observada estava `READY`, ligada ao commit de referência da `main`. Isto confirma publicação do artefacto, não certifica a transacção de marcação. | Deployment pronto; fluxo real não certificado. |

### Diferenças de migrations que exigem reconciliação

A lista remota da produção termina em `20261021141221 theme_engine_v2`; a lista do staging termina em `20261023070547 public_foreign_key_covering_indexes`, tendo também a versão `20261021132342 theme_engine_v2`. A árvore de `main` não contém uma migration com o timestamp de produção `20261021141221`. Existem ainda quatro tabelas operacionais na produção que não aparecem no staging actual.

Não usar as contagens para fazer uma reparação automática. É necessário mapear individualmente cada versão remota para o ficheiro SQL que a originou, comparar o esquema real e rever diferenças funcionais. Não executar `supabase migration repair` em lote nem `supabase db push` sobre produção por suposição.

## 4. CI e testes: resultados que não se devem confundir

| Execução | Resultado observado | Interpretação |
|---|---|---|
| GitHub Actions, verificação do commit de referência, run [39916557989](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39916557989) | Concluída com sucesso. Os jobs de migrations e contratos de segurança, contratos de release, scan de secrets, lint, typecheck, testes, build e budget passaram. | Boa evidência de validação do código e da cadeia local de migrations. Não prova paridade com a produção nem booking real. |
| Suite da Fase 23, run [39916089898](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39916089898) | O job de aceitação da base de dados falhou. O job de concorrência foi ignorado. O E2E de browser básico passou, mas o ciclo completo foi ignorado por falta do ambiente dedicado. | Não aprovado para aceitação real. O motivo documentado é a ausência de `BARBEROS_TEST_DATABASE_URL` e de inputs para concorrência HTTP. |
| Contrato SQL de Phase 24 no staging | O contrato SQL foi reportado como aprovado após as correções aditivas. | Não substitui testes concorrentes em duas sessões nem o teste HTTP end-to-end. |
| Booking real, repetição da mesma chave, slot ocupado, expiração de token e notificação assinada | Não executados nesta sessão. | Não certificado. |

Um teste ignorado não conta como aprovado. O build verde não certifica a integração publicada. Não foi executada uma marcação real nesta Fase 0.

## 5. Riscos classificados

| Severidade | Risco | Efeito possível | Acção exigida |
|---|---|---|---|
| Crítico | Histórico e schema de produção não reconciliados com `main` e staging. | Uma migration pode falhar, reaplicar alterações ou deixar funções e schema incompatíveis. | Reconciliação individual das versões e revisão do esquema antes de qualquer release. |
| Crítico | `booking-create` publicada não corresponde ao handler actual. | Controlos de abuso e idempotência diferem entre ambientes; a criação de marcações não está certificada. | Validar o handler versionado em staging com schema compatível antes de planear rollout. |
| Crítico | Turnstile público não aparece na configuração Vercel consultada. | A UI versionada falha fechada e bloqueia a submissão pública quando a chave está ausente. | Configurar chave pública e modo obrigatório no ambiente certo; configurar e verificar a chave privada no Supabase. |
| Crítico | A suite de aceitação de base de dados/concorrência não tem ambiente dedicado utilizável. | Não há prova recente de concorrência e de ciclo de vida real. | Provisionar uma base de teste isolada e credenciais de CI, sem usar produção. |
| Alto | Segredos de runtime do Supabase não verificáveis pelas ferramentas disponíveis nesta sessão. | Turnstile, limites de pedidos e Resend podem não estar operacionais. | Verificar apenas nomes e estado através do workflow protegido, sem imprimir valores. |
| Alto | `resend-webhook` está no staging, mas não no inventário de produção. | Eventos de entrega, bounce e complaint não estão certificados em produção. | Testar um webhook assinado real no staging e incluir a publicação na sequência aprovada. |
| Alto | 19 foreign keys sem índice de cobertura foram reportadas na produção; no schema verificado do staging o resultado foi zero após a migration de índices. | Consultas e operações podem ter custos maiores; a correcção de produção depende da reconciliação de migrations. | Validar o plano e aplicar a correcção por migration aprovada, só após os gates de schema. |
| Médio | Advisors reportam funções SECURITY DEFINER executáveis por `anon` ou `authenticated`, tabelas RLS sem políticas e uma extensão no schema `public`. | Podem ser decisões legítimas ou superfícies a endurecer; o aviso, isoladamente, não prova exploração. | Rever cada função/política com o contrato e testes, sem revogar grants em massa. |

## 6. Decisão da flag para a Loja da Barbearia

A flag funcional deverá ser **por tenant e desligada por defeito**. Proposta para a Fase 1: adicionar `barbershops.shop_enabled BOOLEAN NOT NULL DEFAULT false` por migration versionada, depois da reconciliação da cadeia.

Regras obrigatórias da flag:

1. A ausência de valor ou de configuração equivale a desligado.
2. Só o proprietário/gestor autorizado da barbearia ou um administrador da plataforma com permissão explícita pode activar a loja.
3. O servidor valida a flag em todas as operações de catálogo e criação/alteração de pedidos. Esconder o passo no frontend não é controlo de segurança.
4. Quando a flag estiver desligada, a UI pública não mostra o passo da loja e a API rejeita pedidos de produtos desse tenant.
5. A flag não aceita o valor enviado livremente pelo cliente como fonte de verdade; é lida do registo autorizado da barbearia.
6. A feature não deve alterar a semântica nem duplicar o motor actual de marcações.

**Estado actual:** esta coluna ainda não existe. A decisão fica documentada, mas não foi criada por SQL nesta Fase 0 porque a cadeia de migrations da produção continua por reconciliar. A loja permanece desactivada e sem rotas operacionais.

## 7. Plano de execução antes de reabrir o gate

### P0.1. Reconciliar schema e migrations

- Exportar e comparar a lista completa de versões de produção, staging e `main`, identificando o SQL correspondente a cada versão.
- Inspeccionar as quatro tabelas operacionais exclusivas da produção e a diferença de timestamp de `theme_engine_v2`.
- Confirmar schema, constraints, funções, grants, RLS e índices no staging; gerar um plano forward-only revisto.
- Não alterar o historial remoto manualmente, não fazer reset de produção e não executar reparação em lote.

### P0.2. Restaurar capacidade de aceitação em CI

- Configurar `BARBEROS_TEST_DATABASE_URL` com uma base de teste dedicada e removível, nunca com a URL de produção.
- Provisionar os inputs de concorrência HTTP em segredo protegido.
- Reexecutar a suite de base de dados, os testes de duas sessões concorrentes e os E2E completos. Nenhuma etapa necessária pode ficar silenciosamente ignorada.

### P0.3. Verificar configurações de segurança

- Configurar e testar Turnstile em staging com a chave pública correcta, `VITE_BOOKING_TURNSTILE_REQUIRED=true` e `TURNSTILE_SECRET_KEY` no runtime Supabase. Não activar bypass em produção.
- Verificar os nomes necessários no runtime Supabase: `RATE_LIMIT_SALT`, `ALLOWED_ORIGINS`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` e `NOTIFICATION_EMAIL_FROM`. Nunca colocar valores no Git, nos logs ou neste relatório.
- Verificar domínio remetente e assinatura real do webhook Resend no staging.

### P0.4. Certificar o motor de marcações no staging

- Publicar apenas no staging a versão aprovada de `booking-create`, após garantir que o schema necessário está aplicado.
- Executar criação de marcação, repetição da mesma chave de idempotência, slot ocupado, token expirado, validação anti-bot, limites de pedidos e notificação assinada.
- Testar concorrência em duas sessões e comprovar que não há marcações duplicadas nem reservas contraditórias.
- Confirmar healthcheck, `token-gateway` e grants/RLS após o teste.

### P0.5. Aprovar produção só depois das evidências

- Confirmar backup recente e responsável por rollback.
- Usar o workflow manual e protegido de Supabase, com todas as condições de release verificadas e revisão do plano de migrations.
- Migrar schema compatível antes de publicar as funções que dele dependem; só depois publicar o frontend.
- Fazer smoke test controlado, verificar erros e voltar a confirmar schema, permissões e disponibilidade. A Loja da Barbearia continua desligada.

## 8. Plano de rollback

Antes da Fase 1, a flag ainda não existe; portanto, não se deve publicar código que dependa dela. Quando implementada:

1. Desactivar a flag apenas para o tenant afectado, bloqueando novos pedidos da loja sem apagar pedidos, movimentos de stock ou dados históricos.
2. Preservar o motor principal de marcações. Não reabrir execução anónima das RPCs de marcação como atalho de recuperação.
3. Se uma Edge Function actualizada falhar, restaurar a versão conhecida como segura pelo mecanismo autorizado de publicação, mantendo migrations aditivas e os grants de segurança.
4. Nunca fazer reset da produção, apagar dados para facilitar testes ou editar directamente o histórico de migrations para forçar um release.
5. Depois da reversão, testar criação e gestão de marcações existentes antes de retomar qualquer rollout.

## 9. Gate de saída da Fase 0

| Critério | Resultado actual |
|---|---|
| Relatório de prontidão produzido e riscos classificados | Concluído neste commit de documentação. |
| Produção e staging identificados e comparados | Concluído; divergências materiais encontradas. |
| Histórico de migrations reconciliado | Não concluído. |
| Configuração Turnstile de produção comprovada | Não concluído; as variáveis necessárias não aparecem na listagem consultada. |
| Secrets de runtime comprovados sem expor valores | Não concluído nesta sessão. |
| Suite de aceitação com DB dedicada e concorrência aprovada | Não concluído; execução recente falhou e concorrência foi ignorada. |
| Motor publicado certificado end-to-end | Não concluído. |
| Flag tenant-scoped criada e desligada por defeito | Decisão documentada; coluna ainda não criada. |
| Plano de rollback documentado | Concluído como procedimento; não executado por não ter ocorrido release. |

**Resultado final: Fase 0 auditada e documentada, gate de saída BLOQUEADO.** A próxima actividade é fechar P0.1 a P0.4 e reunir evidências. Não iniciar a implementação funcional da Loja da Barbearia antes disso.


## 7. Reavaliação do gate após as Fases 1 e 2

A verificação posterior confirmou que a Fase 1 (modelo de domínio) e a Fase 2 (catálogo de gestão) estão versionadas em `main` e aplicadas apenas no staging. No momento desta actualização, `main` continha 123 migrations SQL antes da Fase 2; as sete migrations da Fase 2 elevam o total a 130. O staging regista 93 migrations e a produção 110. Estas contagens continuam a não provar equivalência semântica. O catálogo usa dados reais do tenant autenticado, grants de escrita limitados por coluna, RLS, upload para o bucket público existente `shop-photos`, validação de publicação no PostgreSQL, movimentos de stock pelo ledger e histórico de auditoria. A flag permanece desligada; o catálogo não fica público.

**A Fase 0 não pode ser marcada como concluída.** Permanecem bloqueios que não podem ser resolvidos em segurança apenas por commits de código:
1. A produção tem 110 migrations registadas, o staging 81 antes das migrations da loja e o repositório tem 118 ficheiros de migrations no baseline auditado. É necessária reconciliação individual dos timestamps e do schema; não é seguro executar `db push` ou `migration repair` em lote.
2. A produção não tem `public.booking_idempotency` nem `book_appointment_idempotent`, exigidos pelo handler versionado. A função `booking-create` publicada continua a divergir do código. A sua substituição depende de uma migration/reconciliação segura e de aceitação do fluxo completo.
3. A configuração Turnstile necessária para a marcação pública não foi comprovada no deployment consultado. Não há chave pública/secrets verificados disponíveis nesta sessão para configurar o provider.
4. O workflow de aceitação de base de dados não dispõe de `BARBEROS_TEST_DATABASE_URL`; os testes de concorrência/aceitação HTTP não podem ser considerados aprovados.
5. O workflow de deployment Vercel reportou credenciais de deploy ausentes no GitHub Actions. O smoke das rotas públicas não prova que o commit mais recente tenha sido publicado.

### Acções necessárias para mudar NO-GO para GO

- Fornecer/configurar os valores de Turnstile nos ambientes Vercel/Supabase apropriados e verificar que o widget e o backend usam o mesmo par de chaves.
- Configurar `BARBEROS_TEST_DATABASE_URL` como secret de ambiente GitHub protegido, com uma base de teste isolada e permissões mínimas.
- Configurar as credenciais autorizadas de deployment da Vercel no ambiente GitHub Actions ou confirmar o fluxo alternativo de publicação já autorizado.
- Reconciliar cada migration de produção com o ficheiro SQL de origem e produzir um relatório exact-match de schema/RPC/grants antes de qualquer migration em produção.
- Testar o fluxo real de marcação no ambiente publicado, incluindo Turnstile, idempotência, rate limit, notificações e retries, e registar evidência do commit efectivamente servido.

O código da Fase 2 não remove nenhum destes bloqueios. Não foi feita alteração em produção nem foi declarada uma aceitação E2E inexistente.
