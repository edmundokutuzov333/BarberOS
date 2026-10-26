# BarberOS: auditoria de reconciliação de produção da Loja

Data da verificação: 23 de Outubro de 2026. Repositório: `edmundokutuzov333/BarberOS`, branch `main`. As consultas feitas à produção e ao staging foram somente de leitura.

## Evidência confirmada

| Verificação | Produção `alseiinjzwjdiwtvkdzy` | Staging `asikuyxaapcmayptimxi` |
|---|---|---|
| Registos em `supabase_migrations.schema_migrations` | 110 | 97 |
| Ficheiros SQL em `main` | 135 no repositório | 134 no repositório |
| Migrations a partir de `20261023000000` | 0 | 22 |
| `barbershops.shop_enabled` | ausente | presente |
| Tabelas de catálogo, variantes, pedidos e reservas | ausentes | presentes |
| RPC `get_public_shop_catalog(text)` | ausente | presente |
| RPC `book_appointment_with_shop_order_idempotent` | ausente | presente |
| `booking-create` | versão 1 | versão 5 |

O staging contém `shop_product_categories`, `shop_products`, `shop_product_variants`, `appointment_product_orders`, `appointment_product_order_items`, `inventory_movements`, `inventory_reservations`, `shop_catalog_audit_events` e `booking_idempotency`. A produção não contém estes objectos nem o contrato de criação de marcação e pedido atómico.

Os históricos não são intercambiáveis. Algumas versões registadas na produção têm timestamps diferentes dos prefixos dos ficheiros SQL actuais; o staging também regista um conjunto base com versões remapeadas. Há ainda objectos presentes na produção e ausentes no staging, incluindo `support_tickets`, `platform_access_events`, `gmail_connections`, `gmail_oauth_states` e `_theme_key_backup_20261020`. Estes dados e objectos devem ser preservados.

Na Vercel, o projecto `barber-os` não lista `VITE_SHOP_PUBLIC_CATALOG_ENABLED`. Sem a variável global da Loja, o wizard conserva o percurso actual e não consulta a RPC pública da Loja. A integração CAPTCHA foi removida do código em `main` a 2026-10-26, pelo que não são esperadas chaves CAPTCHA. A Edge Function `booking-create` em produção ainda tem de ser alinhada depois da reconciliação do schema. Não se expuseram valores de segredos.

## O que não foi executado

Não foram aplicadas migrations à produção, nem executado `supabase db push`, `migration repair`, actualização de `schema_migrations`, deploy de Edge Functions ou activação de feature flags. A reconciliação só por nome ou timestamp poderia fazer o CLI repetir DDL já aplicado ou ignorar objectos não equivalentes; os controlos de lançamento existentes não foram contornados.

## Plano seguro de reconciliação forward-only

1. Inventariar produção: schemas, extensões, tabelas, colunas, tipos, índices, constraints, triggers, funções, grants, RLS/policies e versões instaladas. Comparar também as arrays de statements do histórico remoto com os ficheiros de `main`. Não inferir equivalência só pelo nome.
2. Produzir um mapa explícito `versão/name remoto → migration SQL equivalente`, evidenciado por comparação de statements e objectos finais. Quando não houver equivalência demonstrada, manter o caso aberto. Não marcar uma migration como aplicada apenas para fazer o CLI avançar.
3. Restaurar uma cópia isolada do schema de produção em staging dedicado e simular o release e rollback. Preservar os objectos adicionais da produção. Validar o token gateway antes das revogações de EXECUTE, conforme o workflow existente.
4. Aplicar migrations aditivas da Loja só depois de os pré-requisitos e o mapa de versões terem sido aprovados; verificar o schema novamente e executar contratos das Fases 1 a 4, incluindo a corrida de duas sessões e cancelamento/libertação de reservas.
5. Confirmar os segredos obrigatórios do workflow protegido e os quatro segredos de aceitação browser dedicada. Não são necessários segredos CAPTCHA. Fazer deploy da Edge Function actualizada só depois do schema. Validar health check e percursos enquanto ambas as flags da Loja continuam desligadas.
6. Só depois de uma barbearia piloto validar SKU, imagem autorizada, preços, variantes e stock, activar primeiro a flag do tenant e depois o gate global. Confirmar o fluxo publicado antes de alargar o rollout.

## Estado

**NO-GO para produção.** O código da Fase 4 e os contratos transaccionais passam no CI local de `main`, mas produção ainda não tem o schema, as funções nem a versão de Edge Function necessários. A aceitação browser completa continua ignorada quando faltam credenciais dedicadas. Este relatório não altera nem substitui o histórico real do Supabase.


## Reconciliação nominal do histórico (verificação adicional)

A comparação read-only entre os 110 registos de produção e os ficheiros SQL de `main` encontrou correspondência directa por `version_name` em 65 registos, correspondência pelo nome de ficheiro sem prefixo em 11 e correspondência única por sufixo em 26. Oito registos não têm ficheiro correspondente pelo nome/versionamento no repositório: `manual_booking_phone_structural` (20260918153729), `20260918172000_payments_domain_reconcile` (20260918172547), `phase_22_permissions_hardening` (20260918222131), `phase_22_config_write_grants` (20260918222334), `phase_22_public_read_grants` (20260918222928), `phase_22_permission_reconciliation` (20260918223047), `phase27_token_rpc_gateway_lockdown` (20261021063049) e `theme_engine_v2` (20261021141221). A comparação de checksum confirmou que o registo `20260918172547 / 20260918172000_payments_domain_reconcile` é byte-a-byte equivalente a `supabase/migrations/20260918172000_payments_domain.sql` (4.999 bytes, MD5 `94576dd1766e896510783d068cac22e2`), apesar da versão/nome remotos divergirem. Este caso deve ser registado como equivalência de conteúdo, sem `migration repair` cego. Os restantes registos sem correspondência de nome ainda precisam de comparação completa; os 26 matches por sufixo não estão certificados só pelo nome. A tabela de histórico conserva as statements e os seus hashes, pelo que o próximo passo é comparar o conteúdo de cada registo com a migration correspondente antes de emitir qualquer plano de aplicação.


## Actualização da auditoria em 26 de Outubro de 2026, 15:10 UTC

Esta secção substitui os pontos do relatório de 23 de Outubro que afirmavam que o domínio da Loja estava ausente em produção. A consulta read-only actual mostra que as migrations das Fases 1 a 7 estão presentes em produção. O relatório de 23 de Outubro permanece como registo histórico, não como fotografia actual.

### Estado actual confirmado

| Verificação | Produção `alseiinjzwjdiwtvkdzy` | Staging `asikuyxaapcmayptimxi` |
|---|---|---|
| Registos de migrations | 144 | 118 |
| Última migration registada | `20261026101340 phase_25_public_performance_indexes` | `20261026133146 notification_channels_email_first_staging_reconciliation` |
| Tabelas base de catálogo, variantes, pedidos e reservas | Presentes | Presentes |
| `public.get_public_shop_catalog(text)` | Presente | Presente |
| Tabelas de incidentes da Fase 8 | Ausentes | Presentes |
| Tenants de barbearia | 4 | 2 |
| Tenants com `shop_enabled=true` | 0 | 1 tenant QA |
| Produtos/variantes comerciais | 0/0 | Existem apenas fixtures QA; 9 adicionais estão inactivas |

A RPC pública `get_public_shop_catalog` foi consultada em produção para cada um dos quatro slugs. Os quatro resultados foram `enabled=false`, com arrays `products=[]` e `categories=[]`. A Loja pública continua desactivada para todos os tenants de produção.

O staging contém o tenant `shop-phase8-preview-qa`, cujo nome é **BarberOS Preview QA (NÃO COMERCIAL)**. A RPC devolve uma fixture `QA ONLY: Água de teste 500 ml`, preço de simulação 50 MT e saldo de teste 5, com descrição explícita de que não é produto comercial. As nove fixtures adicionais registadas no relatório `BARBEROS_STAGING_QA_CATALOG_FIXTURE_2026-10-26.md` permanecem inactivas e têm 62 unidades simuladas reconciliadas com nove movimentos de stock.

### Estado de publicação

O commit `edef4823e251e7175908495e25149c22081eab63` está no `main` e o deployment Vercel `dpl_9Z21x3fmSrouhGoW8YJw6ThF3uQE` ficou em estado `READY`. A verificação combinada de GitHub/Vercel está `success`. As rotas públicas consultadas no host de produção responderam HTTP 200, o que apenas comprova a entrega da shell web, não uma compra real end-to-end.

No Vercel, `VITE_SHOP_PUBLIC_CATALOG_ENABLED=true` está configurada para `preview`, ligada ao projecto Supabase de staging. Não existe uma configuração equivalente para o ambiente `production`. Esta separação deve manter-se até a aceitação do piloto e os gates de lançamento estarem completos.

### Bloqueios para lançamento comercial

1. O histórico completo das migrations ainda não foi reconciliado por equivalência de conteúdo e de objectos; contagem de migrations, nomes semelhantes e presença das tabelas não substituem essa verificação.
2. A Fase 8 está aplicada em staging, mas as tabelas `shop_operation_incidents` e `shop_operation_incident_events` continuam ausentes em produção. O workflow de release de Supabase também exige validação explícita de staging e de configurações de notificações Resend antes de aplicar alterações.
3. As quatro barbearias em produção não têm produtos nem variantes comerciais, e a consulta da RPC pública confirma que a Loja está desligada.
4. Não existe evidência de aceitação presencial de uma barbearia real, contagem física do stock, confirmação dos preços de venda ou autorização das imagens.

Por estes motivos, o código da Loja está publicado no site BarberOS e o preview de teste está ligado a staging, mas a **Loja comercial não foi activada em produção**. Não activar o gate global nem qualquer flag de tenant usando stock fictício ou preços ilustrativos. A próxima execução de release deve seguir o workflow protegido e, depois, validar um tenant real antes de mudar as flags.
