# Supabase Database Tests

Tests under this directory are database-level acceptance checks.

They should be:
- deterministic
- explicit about whether they mutate data
- safe to run against the intended environment
- independent from UI timing

Phase 2 baseline test:

`migration_phase2.sql`

This file is read-only and validates the current migration/schema contract.


### Phase 8

`booking_wizard_phase8.sql` valida o percurso backend usado pelo wizard público: dia realmente disponível, slot realmente disponível, resolução de "qualquer barbeiro", criação online com token, customer upsert, notification/audit queue, overlap protection e grants públicos sem INSERT directo em `appointments`. Os fixtures do teste são rollback-only.


### Fase 1 da Loja da Barbearia

`shop_domain_phase1.sql` é um contrato de domínio transaccional para executar apenas num ambiente de teste/staging que já tenha aplicado as migrations da Fase 1. Verifica o controlo server-side da feature flag, isolamento entre tenants, snapshots comerciais, invariantes de stock e reservas, transições de estados, privilégios de escrita e o contrato de índices de chaves estrangeiras. Abre uma transacção e termina com `ROLLBACK`, por isso os fixtures não devem persistir.

Execução validada em `BarberOS Remediation Staging` em 23 de Outubro de 2026. Não executar este contrato na produção como substituto de um plano de aceitação.


### Fase 2 da Loja da Barbearia

`shop_catalog_phase2.sql` verifica que o PostgreSQL rejeita publicação sem variante activa ou com categoria inactiva, e que os privilégios não permitem escrita directa do saldo. Os fixtures correm dentro de transacção e terminam com `ROLLBACK`. Executar apenas em staging/teste com as migrations da Fase 2 aplicadas.


### Regras de catálogo e duplicação da Fase 2

`shop_catalog_rules_phase2.sql` verifica o limite/forma das preferências de pedido e a RPC de duplicação. As cópias começam despublicadas, com variantes inactivas, sem SKU e com stock zero; não podem duplicar produto de outro tenant. O contrato é transaccional e termina com `ROLLBACK`.


`shop_public_catalog_phase3.sql` valida a RPC pública da Loja: flag desligada sem fuga de dados, isolamento por slug/tenant, categorias e produtos publicados, variantes activas, disponibilidade após reservas, produtos sem controlo de stock e ausência de campos privados na resposta. Todos os fixtures terminam em `ROLLBACK`; executar apenas em staging/teste após as migrations da Fase 3.
