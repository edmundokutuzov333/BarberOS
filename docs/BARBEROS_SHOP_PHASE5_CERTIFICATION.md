# BarberOS | Certificação operacional da Fase 5

**Data:** 26 de Outubro de 2026  
**Repositório:** `edmundokutuzov333/BarberOS`  
**Branch de correcção:** `fix/shop-phase5-migration-order`  
**Base de código auditada:** `514832a81d71f460a4c0f896983d53495fb83c7d`

## Resultado da verificação

A execução directa de `supabase/tests/shop_order_operations_phase5.sql` no projecto **BarberOS Remediation Staging** terminou sem erro SQL. A contagem de barbearias de teste com slug `phase5-%` foi zero antes e depois da execução, consistente com a transacção e o `ROLLBACK` do contrato.

O contrato cobre entrega completa, entrega parcial, repetição idempotente, reconciliação de reservas, indisponibilidade, recuperação de artigo, cancelamento, falha e reutilização inválida da chave de operação. A correcção acrescenta verificações explícitas para rejeitar a atribuição a um utilizador que não pertence à barbearia e para rejeitar uma nova transição de preparação após a entrega final.

A interface `frontend/src/pages/app/LojaPedidos.tsx` já contém o selector **Responsável do pedido**, carrega membros através de `list_members(p_shop)` e envia a atribuição através de `update_shop_order_operation`. O servidor verifica a membership no tenant. Foi acrescentado um contrato de frontend para impedir regressões neste percurso.

## Defeito de migrations encontrado

A CI mais recente, no run [40284632753](https://github.com/edmundokutuzov333/BarberOS/actions/runs/40284632753), falhou ao construir o schema desde uma base vazia porque duas migrations distintas partilhavam a versão `20261026130000`:

- `20261026130000_shop_order_item_restore_phase5.sql`
- `20261026130000_shop_order_operations_integrity_phase5.sql`

O Supabase recusou gravar a segunda entrada em `schema_migrations` com uma violação da chave única. A migration de integridade foi renomeada para `20261026130100_shop_order_operations_integrity_phase5.sql`, ficando ordenada depois da primeira e antes da migration `20261026140000_shop_order_item_restore_active_phase5.sql`. A execução de CI para a nova revisão ainda tem de confirmar esta correcção.

## Estado dos ambientes

Consultas directas em 26 de Outubro de 2026 observaram:

| Ambiente | Versões registadas | Última versão registada | Tabelas operacionais da Fase 5 |
|---|---:|---|---|
| Produção, `alseiinjzwjdiwtvkdzy` | 110 | `20261021141221` | Ausentes |
| Staging, `asikuyxaapcmayptimxi` | 102 | `20261026071503` | Presentes |

O schema de staging contém os objectos da Fase 5, mas o histórico remoto consultado não contém versões com os timestamps das migrations operacionais actualmente versionadas. Isso indica uma divergência que tem de ser reconciliada, não uma autorização para marcar migrations como aplicadas.

## Bloqueios que permanecem para produção

**A produção continua NO-GO.** Não apliquei migrations à produção, não alterei o histórico remoto e não activei a feature flag da Loja.

Antes do lançamento é necessário: mapear individualmente as versões remotas de produção e staging para o SQL versionado; comparar tabelas, colunas, constraints, índices, triggers, funções, grants e RLS; preservar os objectos exclusivos da produção; simular a sequência forward-only num clone isolado; confirmar os secrets de runtime e a configuração Turnstile por um workflow protegido; e executar a aceitação HTTP/E2E com credenciais dedicadas sem usar dados de produção. A Vercel ter publicado um artefacto não certifica estes percursos.

**Decisão:** a correcção de ordem das migrations e o reforço dos contratos ficam versionados na branch desta revisão. A Fase 5 só poderá ser declarada concluída depois de a CI na nova revisão passar e dos gates de reconciliação e aceitação de produção serem comprovados.
