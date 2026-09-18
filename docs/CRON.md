# BarberOS FASE 15: Cron e Orquestracao Temporal

A FASE 15 liga os dominios transaccionais a um scheduler persistente.

## Jobs activos

| Job | Schedule | Responsabilidade |
| --- | --- | --- |
| barberos-notify-dispatch | * * * * * | Invoca notify-dispatch a cada minuto |
| barberos-holds-expire | */2 * * * * | Cancela holds de sinal expirados |
| barberos-waitlist-rotate | */5 * * * * | Expira ofertas waitlist e roda a fila |
| barberos-daily-digest | 0 5 * * * | Enfileira o digest das 07:00 Africa/Maputo |

A base de dados permanece em UTC. A expressao 0 5 * * * corresponde a 07:00 em Africa/Maputo.

## Infraestrutura

O projecto usa:

- pg_cron para scheduling
- pg_net para chamadas HTTP assíncronas
- Supabase Vault para secrets

O job de notify-dispatch nao guarda uma service/secret key em texto na definicao do job.

A chamada usa:

- publishable key em Vault
- segredo privado de scheduler em Vault
- header x-barberos-cron-secret

O Edge Function aceita publishable auth e valida o segredo privado atraves de um RPC service-only.

## Holds

private.expire_stale_holds() identifica apenas:

- status = pending
- deposit_status = awaiting
- hold_expires_at <= now()

Cada appointment e bloqueada e revalidada antes da transicao para cancelled.

A rotina:

1. evita corrida com o booking lock do barbeiro
2. suprime pending/reminder notifications ainda nao processadas
3. cancela a appointment
4. cria appointment_cancelled
5. escreve audit log
6. deixa o trigger de slot release da FASE 13 distribuir a vaga na waitlist

## Waitlist

private.rotate_expired_waitlist_offers() percorre ofertas expiradas e usa expire_waitlist_offer().

A expiracao:

- marca a oferta como expired
- suprime waitlist_offer pendente
- regista audit
- chama o allocator da FASE 13
- pode criar a proxima oferta no mesmo slot

## Daily digest

private.enqueue_daily_digests() cria uma notificacao email por Owner/Manager com:

- total de marcacoes do dia
- confirmadas
- concluidas
- no-shows
- sinais pendentes
- clientes a aguardar na waitlist
- receita estimada

A criacao e idempotente por loja e dia local. O Edge Function trata template_key=daily_digest.

## Observabilidade

O frontend /app/notificacoes recebe um estado tenant-safe:

- dispatcher activo
- ultima execucao
- estado da ultima execucao
- mensagem do ultimo job

Os detalhes internos de cron nao sao expostos aos utilizadores.

## Validacao

A acceptance suite cobre:

- extensoes pg_cron/pg_net
- quatro jobs activos
- schedules exactos
- Vault scheduler secret
- expiracao de holds
- rotacao de ofertas waitlist
- supressao de notificacoes obsoletas
- idempotencia do digest

As fixtures usam transacao com rollback.
