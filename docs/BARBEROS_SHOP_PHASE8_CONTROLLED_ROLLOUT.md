# BarberOS | Fase 8: rollout controlado e melhoria

**Estado actual: NO-GO para activar a Loja a clientes.** A Fase 8 implementa mecanismos de suporte e preparação de rollout; não declara um piloto real nem uma expansão concluídos.

## Âmbito aplicado

- Expansão controlada por duas barreiras: \`VITE_SHOP_PUBLIC_CATALOG_ENABLED\` no build público e \`barbershops.shop_enabled\` por tenant, controlada no servidor.
- Registo de reclamações e incidentes por barbearia, com severidade, atribuição, estado, nota de resolução e histórico de eventos.
- Relatório operacional com pedidos, artigos entregues, stock baixo, alertas por ler, falhas de canais externos e pagamentos confirmados pela equipa.
- Runbook de suporte, checklist de reversão, release notes e avaliação pós-lançamento.
- A flag do módulo de incidentes, \`VITE_SHOP_OPERATIONS_INCIDENTS_ENABLED\`, permanece desligada por defeito e tem de ser activada separadamente apenas depois de a migration correspondente estar verificada nesse ambiente.

## Gate antes de qualquer rollout

- [ ] Auditoria integral entre histórico remoto, migrations em \`main\` e schema instalado concluída e aprovada.
- [ ] Migration da Fase 8 instalada e validada num ambiente de staging dedicado, com reset limpo e suite completa.
- [ ] CI verde no SHA candidato: lint, typecheck, testes de frontend, contratos, SQL, segurança e build.
- [ ] Deployment identificado e testado no ambiente correcto; não assumir que o sucesso do build prova o funcionamento integrado.
- [ ] Catálogo real aprovado pela barbearia, com SKU/descrição, preço, stock e fotografia cuja origem/permissão foi confirmada.
- [ ] Gestor, recepção e barbeiro realizaram o percurso real e a aceitação está documentada, sem substituir isto por teste automatizado.
- [ ] Responsável de suporte definido, fluxo de incidentes ensaiado e procedimento de reversão validado.
- [ ] Nenhum defeito crítico de tenant, preço, idempotência, stock, associação à marcação ou registo de pagamento permanece aberto.

## KPIs e rotina

| Indicador | Definição de controlo |
|---|---|
| Utilização da Loja | Marcações elegíveis confirmadas com pelo menos um artigo, dividido pelas marcações elegíveis confirmadas. |
| Cumprimento | Linhas entregues na quantidade acordada, dividido pelas linhas aceites. |
| Indisponibilidade | Linhas não satisfeitas por falta de stock, dividido pelas linhas pedidas. |
| Tempo até pronto | Hora em que o pedido fica pronto menos hora de aceitação/preparação. |
| Conversão em venda paga | Pedidos pagos, não apenas pedidos criados ou entregues. |
| Receita incremental por visita | Venda de produtos paga e atribuível à visita, excluindo intenções não pagas. |
| Reclamações e incidentes | Volume por tipo/severidade, tempo até resolução, reincidência e reclamações abertas. |
| Divergência de stock | Diferença entre saldo registado, reservas, movimentos e contagem física. |

Durante o piloto, a recepção ou gestor deve reconciliar pedidos, entregas, stock e pagamentos todos os dias. O responsável de suporte revê alertas e incidentes críticos no próprio dia. Depois de uma semana completa de operação, comparar indicadores e incidentes com a linha de base, documentar o que mudou e decidir continuar, corrigir, pausar ou reverter. Estes intervalos são regras operacionais propostas para o rollout, não resultados observados.

## Regras para incidentes

O histórico de eventos é registado em conjunto com cada alteração de estado. Apenas proprietário/gestor do tenant ou administrador autorizado pode usar as RPCs. As tabelas não permitem escrita directa por clientes autenticados; os comandos passam pelas funções de servidor com verificação de tenant. Uma ocorrência resolvida ou encerrada não pode ser reaberta pela mesma RPC. A resolução exige nota com causa/correcção e evidência.

Não incluir dados pessoais desnecessários em resumo, detalhes, logs ou analytics. Usar o ID do pedido, quando necessário, em vez de copiar o nome, telefone ou token de gestão do cliente.

## Plano de reversão

1. Desactivar \`VITE_SHOP_PUBLIC_CATALOG_ENABLED\` no build público e publicar o artefacto estável conhecido.
2. Com acesso administrativo autorizado, pôr \`shop_enabled=false\` no tenant afectado. A alteração de flag não deve ser feita pelo browser.
3. Confirmar que o wizard público voltou ao percurso normal sem apagar marcações ou pedidos já registados.
4. Manter os ledgers e o histórico operacional. Reconciliar entregas, movimentos de stock e pagamentos registados antes de qualquer correcção manual.
5. Registar motivo, incidentes associados, hora, responsável e critério para voltar a tentar.
6. A flag do módulo de incidentes só pode ser desligada depois de existir um canal alternativo para aceder ao histórico de suporte; a migration não deve ser revertida destrutivamente.

## Avaliação pós-lançamento

**Período:** ________  **Barbearia:** ________  **Responsável:** ________

- Marcação com e sem artigos testada por cliente real: ____________________
- Pedidos aceites, cumpridos e parcialmente cumpridos: ____________________
- Reconciliação de stock e pagamentos: ____________________
- Tempo até pronto e causas de indisponibilidade: ____________________
- Reclamações/incidentes, gravidade, resolução e reincidência: ____________________
- Incidentes críticos abertos: ____________________
- Decisão: continuar / corrigir / pausar / reverter: ____________________
- Evidência e aprovação: ____________________

## Estado de segurança do rollout

Na entrega desta fase não foram activadas flags por tenant. A migração está versionada e foi executada apenas numa transacção de staging com rollback para testar o contrato. A base persistente continua sem as tabelas de incidente desta fase; a aplicação pública não foi alterada para servir a Loja a clientes.


## Índices e integridade referencial

A migration adicional `20261026220000_shop_incident_foreign_key_indexes_phase8.sql` cobre explicitamente as colunas iniciais das chaves estrangeiras do pedido, da linha de auditoria e do actor. A gate de CI que verifica índices para todas as FKs públicas continua a ser obrigatória antes de qualquer rollout.
