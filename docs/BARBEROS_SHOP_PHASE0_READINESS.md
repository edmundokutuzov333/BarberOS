# BarberOS | Relatório de prontidão da Fase 0: Loja da Barbearia

**Data da verificação:** 23 de Outubro de 2026  
**Repositório:** [edmundokutuzov333/BarberOS](https://github.com/edmundokutuzov333/BarberOS)  
**Branch auditada:** `main`  
**Commit de referência da auditoria:** [`afa2788c2a2884cfa4e331218c1468578712f4a0`](https://github.com/edmundokutuzov333/BarberOS/commit/afa2788c2a2884cfa4e331218c1468578712f4a0)  
**Estado actualizado após a implementação das Fases 1 e 2 em staging:** **NO-GO para produção.** O catálogo de gestão pode ser preparado em staging atrás da flag desligada, mas não ligar o fluxo público nem associar pedidos à criação de marcações até a reconciliação de produção e a aceitação real serem comprovadas.

## 1. Resumo executivo

A especificação da Loja da Barbearia define uma pré-encomenda opcional, ligada à marcação existente. Não é um marketplace nem uma loja independente. O cliente pode pedir artigos para consumo no local ou compra para levar; pedido, preparação, entrega e pagamento têm estados separados. Cada barbearia controla o seu catálogo, preços, variantes e stock.

A Fase 0 exigia reconciliar os bloqueios do motor de marcações, comparar produção com staging, verificar migrations, RLS, secrets e a Edge Function `booking-create`, definir a flag da loja desligada por defeito e preparar um plano de reversão.

A consulta directa aos ambientes encontrou diferenças materiais entre o código, o staging e a produção. A produção não contém a tabela e a RPC de idempotência usadas pela implementação actual de `main`; a função `booking-create` publicada não contém os controlos presentes no código versionado nem no handler de staging. A chave pública do Turnstile e a variável que o torna obrigatório não aparecem na lista de variáveis de ambiente visíveis da Vercel. A suite de aceitação utiliza uma base Supabase local efémera no runner GitHub; a execução já ultrapassou o executor SQL com `ClientCursor(conn)` e chegou aos contratos CRM. Falhou porque o teste exigia `CUSTOMER_NOT_FOUND` mesmo quando o guard de autorização negava correctamente a chamada com `SHOP_OPERATOR_REQUIRED`; o contrato foi ajustado para aceitar ambos.

**Decisão:** manter a Loja da Barbearia indisponível ao público. As migrations das Fases 1 e 2 foram aplicadas apenas no staging e estão versionadas em `main`. Não alterar o schema de produção, não publicar uma nova Edge Function de marcações e não activar o rollout enquanto os bloqueios abaixo não forem resolvidos e comprovados.

## 2. Âmbito e limites da execução

Foram efectuadas leituras do repositório e consultas de leitura aos ambientes Supabase e Vercel. Foram consultados o estado de `main`, a documentação de release, as migrations, o schema público, os privilégios de RPC, o inventário das Edge Functions, os nomes das variáveis de ambiente visíveis e os resultados recentes de CI.

Na Fase 0 não foram feitas alterações de schema, dados, grants ou secrets na produção. Não houve reset de bases de dados, não foi publicada nenhuma Edge Function de marcações e não foi criada uma marcação fictícia. As migrations da loja foram aplicadas apenas no staging, como trabalho posterior das Fases 1 e 2. Os testes que exigem credenciais e uma base de dados dedicada não foram contornados.

Os secrets de runtime do Supabase não puderam ser inspeccionados directamente através das ferramentas de consulta disponíveis nesta sessão. A presença de um nome de variável na Vercel não prova a presença desse segredo no runtime das Edge Functions.

## 3. Evidência verificada

| Área | Evidência observada | Estado |
|---|---|---|
| GitHub | `main` apontava para o commit de referência acima no início da auditoria. A comparação confirmou que esse commit era idêntico à referência de `main` no momento da leitura. | Confirmado para a referência inicial. |
| Migrations | Baseline da auditoria inicial: 118 ficheiros SQL em `main`, 110 versões na produção e 81 no staging. Snapshot após a Fase 3, em 23 de Outubro: 132 ficheiros SQL em `main`, 110 versões na produção e 95 no staging. As contagens não demonstram equivalência semântica. | Bloqueado. |
| Schema | `public.booking_idempotency` e a RPC `book_appointment_idempotent` existem no staging, mas não existem na produção. | Bloqueio crítico. |
| Handler de marcações | A Edge Function `booking-create` da produção não contém a validação Turnstile, os primitivos de rate limit nem o caminho idempotente encontrados no código de `main` e no handler de staging. | Bloqueio crítico. |
| Privilégios de marcação | A RPC antiga `book_appointment` não pode ser executada por `anon` nem `authenticated` na produção; o papel `service_role` mantém acesso. A RPC idempotente usada pelo código actual não existe na produção. | Contenção parcial confirmada, integração não certificada. |
| Turnstile na Vercel | A listagem actual de variáveis visíveis não inclui `VITE_TURNSTILE_SITE_KEY` nem `VITE_BOOKING_TURNSTILE_REQUIRED`. O wizard versionado bloqueia a submissão em produção quando a chave pública não está configurada. | Bloqueio crítico para a marcação pública. |
| Edge Functions | Produção: `booking-create v1`, `health v1` e `token-gateway v1` activas; `resend-webhook` ausente. Staging: `booking-create v1`, `health v1`, `token-gateway v1` e `resend-webhook v1` activas. | Divergência entre ambientes. |
| Tabelas públicas | Baseline inicial: 24 tabelas na produção e 22 no staging. Última leitura após as migrations aditivas: 24 tabelas na produção e 30 no staging. Só na produção: `support_tickets`, `platform_access_events`, `gmail_connections`, `gmail_oauth_states`. Só no staging: `appointment_product_order_items`, `appointment_product_orders`, `booking_idempotency`, `inventory_movements`, `inventory_reservations`, `resend_email_events`, `shop_catalog_audit_events`, `shop_product_categories`, `shop_product_variants`, `shop_products`. | Reconciliar antes de qualquer release de schema. |
| RLS | RLS está activada em todas as tabelas públicas devolvidas pela listagem. O advisor assinala tabelas sem políticas e funções SECURITY DEFINER acessíveis por alguns papéis; cada caso precisa de revisão pelo contrato e pelo corpo da função. | Revisão selectiva necessária. |
| Flag da loja | Não foi encontrada a coluna `shop_enabled`, a tabela de catálogo da loja ou a rota de gestão `/app/loja` no repositório auditado. | Não implementada; deve permanecer desligada por ausência da funcionalidade. |
| Vercel | A deployment de produção observada estava `READY`, ligada ao commit de referência da `main`. Isto confirma publicação do artefacto, não certifica a transacção de marcação. | Deployment pronto; fluxo real não certificado. |

### Diferenças de migrations que exigem reconciliação

A lista remota da produção inclui `20261021141221 theme_engine_v2`; a lista actual do staging termina em `20261023070547 public_foreign_key_covering_indexes` e também contém `20261021132342 theme_engine_v2`. A árvore de `main` não contém uma migration com o timestamp de produção `20261021141221`. Existem quatro tabelas operacionais na produção que não aparecem no staging actual e dez tabelas presentes apenas no staging.

Não usar as contagens para fazer uma reparação automática. É necessário mapear individualmente cada versão remota para o ficheiro SQL que a originou, comparar o esquema real e rever diferenças funcionais. Não executar `supabase migration repair` em lote nem `supabase db push` sobre produção por suposição.

## 4. CI e testes: resultados que não se devem confundir

| Execução | Resultado observado | Interpretação |
|---|---|---|
| GitHub Actions, verificação do commit de referência, run [39916557989](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39916557989) | Concluída com sucesso. Os jobs de migrations e contratos de segurança, contratos de release, scan de secrets, lint, typecheck, testes, build e budget passaram. | Boa evidência de validação do código e da cadeia local de migrations. Não prova paridade com a produção nem booking real. |
| Suite da Fase 23, run [39973135223](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39973135223) | A suite de base de dados falhou em `manual_booking_phase11.sql` com `psycopg.errors.SyntaxError: syntax error at or near "$"`; a variável `BARBEROS_TEST_DATABASE_URL` está configurada para a base Supabase local efémera. O browser smoke passou; o ciclo autenticado completo não foi executado por falta dos secrets E2E dedicados. | Aceitação global ainda não aprovada; a primeira correcção falhou por usar um argumento `cursor_factory` não suportado pelo psycopg 3; o runner foi ajustado para `ClientCursor(conn)` e precisa de nova execução. |
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

- Manter `BARBEROS_TEST_DATABASE_URL` apontado para a base Supabase local efémera do job (ou uma base dedicada comprovadamente isolada); nunca usar a URL de produção. A suite actual falhou devido ao protocolo de execução SQL, que foi corrigido em `scripts/test_database_phase23.py` e aguarda nova CI.
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
4. O workflow define `BARBEROS_TEST_DATABASE_URL` para Supabase local efémero, mas a suite Phase 23 falhou devido ao executor Psycopg ao processar scripts com `DO $`. A execução chegou aos contratos CRM após corrigir o executor; a aprovação depende da nova CI que valida a asserção cross-tenant ajustada. O ciclo completo de browser autenticado continua ignorado sem secrets E2E dedicados.
5. A integração GitHub–Vercel publicou o commit `1279226d9f18c498b21211159cfdf94d472cfd6e` e o workflow de produção [39973135125](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39973135125) passou preflight, deployment e smoke. Isto confirma publicação e smoke, não o funcionamento do pedido integrado, porque a produção ainda não tem o schema/RPC da Loja.
6. O gate Phase 25 de desempenho público continua vermelho: LCP medido a 2.856 ms e 3.120 ms, acima do limite de 2.500 ms em Fast 3G. Uma execução anterior, no commit `58feaa770f011cef42a6847ac72eaa85cf0b0cc3`, também falhou (2.836 ms), pelo que é um problema pré-existente que ainda requer correcção e nova medição.

### Acções necessárias para mudar NO-GO para GO

- Fornecer/configurar os valores de Turnstile nos ambientes Vercel/Supabase apropriados e verificar que o widget e o backend usam o mesmo par de chaves.
- Os workflows de aceitação SQL usam agora uma base Supabase local efémera por job, reconstruída a partir da cadeia de migrations. A aceitação HTTP/E2E ainda requer credenciais e endpoints de teste dedicados.
- Configurar as credenciais autorizadas de deployment da Vercel no ambiente GitHub Actions ou confirmar o fluxo alternativo de publicação já autorizado.
- Corrigir o orçamento LCP do percurso público e repetir o benchmark Fast 3G até cumprir o limite definido.
- Reconciliar cada migration de produção com o ficheiro SQL de origem e produzir um relatório exact-match de schema/RPC/grants antes de qualquer migration em produção.
- Testar o fluxo real de marcação no ambiente publicado, incluindo Turnstile, idempotência, rate limit, notificações e retries, e registar evidência do commit efectivamente servido.

O código da Fase 2 não remove nenhum destes bloqueios. Não foi feita alteração em produção nem foi declarada uma aceitação E2E inexistente.


## Actualização posterior: Fase 3 (23 de Outubro de 2026)

A Fase 3 acrescentou a leitura pública segura do catálogo e o passo condicional do wizard. A migration `20261023120503_shop_public_catalog_phase3` foi aplicada ao projecto `BarberOS Remediation Staging`; o contrato transaccional `shop_public_catalog_phase3.sql` foi executado com sucesso e terminou em `ROLLBACK`. A flag de loja continua desligada e não foram aplicadas migrations ou alterados dados na produção.

O inventário actual é de 132 ficheiros SQL em `main`, 95 migrations registadas no staging e 110 na produção. O novo contrato público não reconcilia o histórico nem o schema do motor de marcações entre ambientes. A Fase 0 mantém-se **NO-GO** e `shop_enabled` não pode ser activada antes da integração transaccional da Fase 4, validação ponta a ponta e resolução dos bloqueios acima.


### Deployment automático da Fase 3 e contenção (23 de Outubro de 2026)

A integração Git da Vercel publicou automaticamente o commit `15fc1447b15e9609b7c31eaf4ff588e2de516012` em produção; o deployment `dpl_EdzHcFxmA3JNdN9dvXUxPi89o7tZ` ficou `READY` e associado a `main`. A acção de deployment explícito do GitHub Actions foi ignorada por falta de credenciais, mas não impediu a publicação automática. O percurso `/barbearia/oryon/marcar` respondeu HTTP 200. A consulta SQL read-only à produção confirmou `get_public_shop_catalog(text)=NULL`, `book_appointment_idempotent(...)=NULL` para a assinatura consultada e ausência da coluna `barbershops.shop_enabled`. Nenhuma migration foi aplicada à produção.

Para evitar qualquer chamada a uma RPC inexistente, o commit correctivo adiciona o gate global `VITE_SHOP_PUBLIC_CATALOG_ENABLED`, desligado por defeito. O passo da Loja requer simultaneamente esse gate no build e a flag por tenant no servidor. A Fase 0 continua **NO-GO**; o deployment READY e o HTTP 200 não são certificação funcional ponta a ponta.


## Actualização da Fase 4 (23 de Outubro de 2026)

A migration `20261023124453_shop_order_atomic_phase4` estava registada no staging mas o ficheiro não existia em `main`. O artefacto foi reconstruído a partir das definições de funções verificadas no staging e reposto com o mesmo identificador. A Fase 4 agora liga a marcação, o pedido, as linhas com snapshots de preço, as reservas e a resposta idempotente numa transacção. O token gateway devolve o pedido persistido usando o token de gestão existente.

A suite `shop_order_atomic_phase4.sql` foi executada em staging sem erro. Cria uma barbearia QA, horários, produto e stock dentro da transacção e termina com `ROLLBACK`; as consultas posteriores confirmaram zero barbearias `phase4-*`, zero produtos QA persistidos e zero barbearias activadas. O teste de concorrência com duas sessões foi adicionado ao CI na base local efémera; só será considerado aprovado depois de o workflow terminar.

A produção continua sem `barbershops.shop_enabled`, sem tabelas de pedidos/reservas e sem `book_appointment_with_shop_order_idempotent`. O histórico contém versões equivalentes com timestamps diferentes; não é seguro marcar versões como aplicadas nem executar um `db push` amplo. Main terá 134 ficheiros SQL, staging 97 migrations registadas e produção 110. A Fase 0 permanece **NO-GO**. Não activar a Loja nem alterar a produção até um plano forward-only de reconciliação ser validado e executado, a aceitação dedicada estar configurada e o gate de performance passar.


### Optimização de LCP da página pública

O gate Fast 3G identificou como maior elemento de conteúdo a descrição longa da barbearia no hero, com LCP entre 2,6 s e 3,2 s, enquanto DCL ficou perto de 1,3 s. A descrição completa foi preservada numa secção “Sobre a barbearia” e o hero passou a mostrar uma linha de resumo, reduzindo a área do candidato LCP sem remover conteúdo. A aprovação só será declarada após o workflow de performance medir o deployment desta revisão.


### Correcção da revisão Fase 4 (23 de Outubro de 2026)

A revisão inicial `1f0d9ee513b213b24a56fb3a12845750c2d4b004` falhou no CI por erros de TypeScript e porque o SQL reconstruído não terminava as definições de funções com ponto e vírgula. A revisão correctiva mantém o percurso de marcação sem produtos compatível com a produção: o lookup usa apenas `response` e a RPC permanece `book_appointment_idempotent`. O fingerprint e o RPC combinado só são consultados quando há artigos. A chamada de produtos continua a falhar fechada em produção até o schema ser reconciliado.

Os gates SQL de aceitação e performance usam uma base Supabase local efémera por job, isolada e reconstruída a partir das migrations; já não dependem de `BARBEROS_TEST_DATABASE_URL` como secret externo. O teste HTTP de concorrência foi ligado ao tenant QA do projecto staging, resolve dinamicamente um slot livre e cancela a marcação criada no bloco de limpeza. O ciclo completo de browser autenticado continua dependente de credenciais próprias. O gate Fast 3G continua pendente de nova medição.


### Correcção final do candidato LCP (23 de Outubro de 2026)

A medição Fast 3G no deployment público confirmou que o maior elemento era a descrição completa dentro de `Sobre a barbearia` (2.560–2.940 ms). A descrição completa mantém-se disponível, mas passa para um `details/summary` fechado por defeito, evitando que um parágrafo longo seja pintado no primeiro viewport. A próxima medição do workflow é a evidência necessária para declarar o gate LCP aprovado; até lá o gate permanece aberto.


A segunda medição identificou o título da barbearia como candidato LCP (2.732 ms no primeiro Chromium, 2.388 ms no retry; mobile Chrome 2.456 ms). Para reduzir o atraso de carregamento do módulo de rota, `App.tsx` passa a pré-carregar `PublicBarbershop` imediatamente quando a URL já é `/barbearia/:slug`, em paralelo com o bootstrap. A próxima execução Fast 3G deve confirmar se a melhoria é estável; o gate anterior passou apenas com retry e ainda não é considerado robusto.


### Actualização de execução da Fase 4 (23 de Outubro de 2026, SHA `1279226d9f18c498b21211159cfdf94d472cfd6e`)

A verificação principal [39973135133](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39973135133) concluiu com sucesso. A migration chain desde uma base vazia, pgTAP, contratos SQL das Fases 1–4 e corrida concorrente de duas sessões passaram. O teste atómico da Fase 4 também passou em staging e deixou zero pedidos, linhas, reservas ou tenants activados após `ROLLBACK`. A suite Phase 23 já executa os scripts SQL com `ClientCursor(conn)`, mas a última tentativa falhou numa asserção cross-tenant do CRM demasiado restrita. A correcção aceita tanto a negação por membership (`SHOP_OPERATOR_REQUIRED`) como a negação por tenant (`CUSTOMER_NOT_FOUND`) e aguarda nova execução.

O gate Fast 3G passou no SHA `7dcf9f52d6a505861a9eed01cfb980daa5f481c4`, run [39974021402](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39974021402): LCP 2.144/2.172 ms, DCL 1.256/1.289 ms, CLS 0, RPC 416/372 ms e INP 40/64 ms. A revisão actual altera apenas o executor de aceitação e documentação; o frontend não mudou.

A Vercel publicou o SHA actual com sucesso e o smoke passou. Produção continua sem as tabelas e RPC da Loja, sem a coluna `shop_enabled` e sem a configuração Turnstile comprovada; a feature flag global permanece desligada e nenhuma migration foi aplicada à produção. O estado de lançamento permanece **NO-GO**.


### Actualização de aceitação Phase 23 após correcção do executor (23 de Outubro de 2026)

O runner agora executa os ficheiros SQL completos através de `psycopg.ClientCursor(conn)`, sem dividir blocos PL/pgSQL. A execução [39974628959](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39974628959) ultrapassou esse problema e falhou em `customer_crm_phase12.sql`: o teste exigia `CUSTOMER_NOT_FOUND` para uma consulta cross-tenant, mas a função negou correctamente a chamada antes com `SHOP_OPERATOR_REQUIRED`, porque o utilizador não é membro do tenant alvo. O teste foi ajustado para aceitar ambos os erros de negação; aguarda nova CI. Nenhum dado de produção foi usado: a suite corre numa base Supabase local efémera.


### Actualização da suite Phase 23: contrato waitlist (23 de Outubro de 2026)

Depois da correcção do executor SQL e da asserção CRM, a suite chegou a `waitlist_phase13.sql`. O teste contradizia o próprio contrato de segurança: confirmava que as RPCs de token só podem ser executadas por `service_role`, mas invocava `get_waitlist_offer` como `anon`, causando `permission denied`. O teste foi corrigido para chamar `get_waitlist_offer`, `claim_waitlist_offer` e `expire_waitlist_offer` com `service_role`; os joins públicos continuam testados como `anon`. A nova CI está pendente. A aplicação não foi alterada para abrir permissões.


## Estado actualizado da Fase 4 e gates (23 de Outubro de 2026, após SHA d5c3c3b)

A verificação [39975771201](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39975771201) passou no SHA `d5c3c3b27eae8b6ef37137b460062eec06e518e0`: migrations desde base vazia, pgTAP, contratos SQL das Fases 1–4, race de stock em duas sessões, typecheck, build e contratos de deployment. A performance pública mais recente passou no run [39974629196](https://github.com/edmundokutuzov333/BarberOS/actions/runs/39974629196) no SHA `67d299b4b25b81cba0848b7c57e63e2819742ca6`, com LCP 2.172/2.264 ms, DCL 1.280/1.263 ms, CLS 0, RPC 415/440 ms e INP 80/104 ms. A mesma documentação é actualizada no novo candidato para disparar nova execução do gate.

A suite Phase 23 no SHA `d5c3c3b` chegou à expiração da waitlist e falhou em `WAITLIST_EXPIRE_FAILED`: uma substituição posterior da função não devolvia o estado persistido `expired`. Foi acrescentada uma migration forward-only para corrigir o resultado mantendo acesso apenas por `service_role`, e o runner de aceitação faz agora rollback explícito antes da limpeza de fixtures quando um contrato falha. O novo workflow tem de confirmar a correcção.

A comparação read-only encontrou 110 registos de migration em produção, 97 em staging e 134 ficheiros versionados no repositório. Produção não tem as tabelas/RPC da Loja nem `barbershops.shop_enabled`; `booking-create` permanece na versão 1, o gate global e as variáveis públicas Turnstile não constam da configuração Vercel consultada. A aceitação completa de browser mantém-se ignorada por falta de credenciais dedicadas. Não foram aplicadas migrations nem activadas flags de produção. Ver `docs/BARBEROS_SHOP_PRODUCTION_RECONCILIATION.md`.

**Estado actual: Fase 4 transaccional aprovada em CI local/staging; lançamento em produção NO-GO até a reconciliação e os gates externos estarem concluídos.**
