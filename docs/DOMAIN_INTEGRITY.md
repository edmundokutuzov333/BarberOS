# BarberOS Domain Integrity, Fase 3

## Objectivo

Esta fase fecha os invariantes do domínio antes das áreas pública e operacional. O banco continua a ser a fonte de verdade e o frontend consome operações de domínio por RPC quando a operação precisa de atomicidade.

## Horários

A base permite exactamente um horário base por loja e por dia e no máximo um override por barbeiro e por dia, através de índices únicos parciais. A API replace_working_hours valida o tenant, aceita sete linhas para a grelha base ou zero/sete para um override e substitui o conjunto numa única transacção.

## Tenant integrity

Relações que cruzam entidades do domínio são verificadas no PostgreSQL. Serviços, cortes, barbeiros, clientes, horários, bloqueios, marcações, lista de espera, avaliações, pagamentos e notificações relevantes têm validação para impedir combinações entre lojas diferentes. A imutabilidade de barbershop_id introduzida na Fase 1 continua activa.

## Reordenação

reorder_services, reorder_haircuts e reorder_barbers exigem um operador da loja e a lista completa dos IDs daquela loja. A alteração de sort_order é feita numa só chamada. Payload incompleto, duplicado ou de outro tenant é rejeitado.

## Frontend

A configuração usa o contrato TypeScript gerado pelo Supabase. Serviços e barbeiros usam a mesma interacção drag-and-drop existente, mas persistem por RPC. O catálogo de cortes mantém a grelha e ganhou controlos de mover para cima/baixo, utilizáveis por teclado e sem exigir drag em duas dimensões.

Horários e overrides deixaram de executar delete seguido de insert no browser. O mesmo RPC trata gravação completa e remoção de override.

## Acceptance

O teste read-only está em supabase/tests/domain_integrity_phase3.sql. Ele valida a cadeia de migrations, índices, constraints, RPCs, grants, triggers e ausência de relações cross-tenant no estado vivo.

## Agregado barbeiro

A criação e edição de barbeiros usa save_barber, que grava os dados do barbeiro e a lista completa de serviços numa única transacção. O RPC valida operador, tenant, conta ligada, duplicação de serviços e pertença dos serviços à loja.
