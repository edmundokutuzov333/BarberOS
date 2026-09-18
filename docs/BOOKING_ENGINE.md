# BarberOS Booking Engine 2.0

## Fonte de verdade

A criação de uma marcação é uma operação transaccional no PostgreSQL. O frontend nunca escreve directamente em `appointments`, `customers` ou `notifications` para criar uma marcação.

O único ponto público de criação é:

`book_appointment(slug, service_id, haircut_id, barber_id, start, name, phone, email)`

## Fluxo

1. Validação de entrada.
2. Resolve a barbearia em estado `trial` ou `active`.
3. Valida serviço, corte e barbeiro dentro do mesmo tenant.
4. Resolve barbeiro quando o pedido usa "qualquer barbeiro".
5. Adquire advisory lock transaccional por barbeiro.
6. Volta a consultar a disponibilidade real.
7. Cria ou actualiza o cliente pelo telefone dentro da barbearia.
8. Calcula o sinal, quando aplicável.
9. Cria a marcação.
10. Trata a exclusion constraint como última barreira contra overlap.
11. Coloca notificações na fila.
12. Regista `appointment_created` em `audit_logs`.

## Concorrência

Uma segunda tentativa para o mesmo barbeiro e início, depois do primeiro booking ter sido confirmado, recebe `SLOT_TAKEN`. A exclusion constraint `appointments_no_overlap` permanece como garantia final no PostgreSQL.

O motor trabalha em transacção e usa `pg_advisory_xact_lock`, portanto a decisão de disponibilidade e a inserção não ficam separadas por uma janela de concorrência.

## Sinal

Quando a barbearia exige sinal para o serviço:

- `status = pending`
- `deposit_status = awaiting`
- `needs_payment = true`
- `hold_expires_at = now() + deposit_hold_min`

Sem sinal:

- `status = confirmed`
- `deposit_status = not_required`
- `needs_payment = false`

O provider de pagamento fica deliberadamente fora desta fase. A marcação fica preparada para a próxima camada de pagamentos.

## Notificações

A criação gera a confirmação imediata no canal WhatsApp e, quando existe email, no canal email. Lembraças de 24h e 1h são enfileiradas quando o horário permite.

Uma marcação pendente usa `appointment_pending`, não `appointment_confirmed`.

## Fronteira do frontend

A implementação está em:

`frontend/src/features/booking/api.ts`

A feature usa os tipos gerados do Supabase, normaliza o telefone para o formato canónico e invalida a cache de disponibilidade após sucesso.

A decisão de negócio continua no RPC. O frontend é apenas a camada de intenção, apresentação e tratamento de estado.

## Segurança

- `book_appointment`: EXECUTE para anon/authenticated.
- `appointments`: INSERT directo revogado para anon/authenticated.
- `enqueue_appointment_notifications`: EXECUTE interno, não público.
- Funções SECURITY DEFINER com `search_path = ""`.
- Tenant integrity e `appointments_no_overlap` permanecem activos.

## Aceitação

A suíte vive em `supabase/tests/booking_phase5.sql` e testa, em rollback:

- booking confirmado;
- normalização de telefone moçambicano;
- fila de notificações;
- audit log;
- segunda marcação no mesmo slot -> `SLOT_TAKEN`;
- booking com sinal e hold;
- rejeição de telefone inválido;
- ausência de fixtures persistentes;
- grants e isolamento do RPC interno.
