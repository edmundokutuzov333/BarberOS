# BarberOS Appointment Token Management

## Identity pública

A marcação é gerida pelo `manage_token`. O cliente não precisa de conta.

O browser nunca recebe `appointment_id`, `customer_id`, `barber_id`, `barbershop_id` ou `service_id` através do contrato público.

## Funções públicas

- `get_appointment_by_token(token)`
- `get_reschedule_slots_by_token(token, date)`
- `cancel_appointment_by_token(token, reason)`
- `reschedule_appointment_by_token(token, new_start)`

Todas são `SECURITY DEFINER`, com `search_path=""`, grants explícitos para `anon` e `authenticated`, e sem DML directo público sobre `appointments`.

## Consulta

A página `/marcacao/:token` recebe apenas os dados necessários para a experiência:

- barbearia e contactos públicos;
- nome do cliente;
- serviço, corte e barbeiro;
- data, hora, duração e preço;
- estado da marcação;
- estado e valor do sinal;
- prazo e flags de cancelamento/remarcação.

## Cancelamento

O PostgreSQL valida:

- token válido;
- estado `pending` ou `confirmed`;
- marcação futura;
- política da barbearia;
- prazo de alteração;
- motivo opcional até 500 caracteres.

O cancelamento:

1. adquire o mesmo advisory lock do booking;
2. bloqueia lembretes ainda enfileirados;
3. marca a appointment como `cancelled`;
4. enfileira `appointment_cancelled`;
5. grava `appointment_cancelled` no audit log.

A `appointments_no_overlap` deixa de considerar a marcação depois da alteração de estado, libertando o horário.

## Remarcação

A remarcação usa o mesmo motor de disponibilidade do booking.

O fluxo é:

token → política → advisory lock → row lock → disponibilidade PostgreSQL → update de horário → novos lembretes → notificação → audit.

O novo horário nunca é aceite apenas porque o frontend o apresentou.

Uma colisão devolve `SLOT_TAKEN`.

Pedidos com sinal pendente cujo hold já expirou não podem ser remarcados.

## Experiência

`frontend/src/pages/AppointmentManage.tsx` implementa:

- loading;
- erro de link inválido;
- estado da marcação;
- resumo da marcação;
- cancelamento com confirmação;
- remarcação com data e slots reais;
- adicionar ao calendário;
- contacto com a barbearia via WhatsApp;
- feedback de sucesso e erro.

A página funciona sem autenticação e é mobile-first.

## Calendário

`frontend/src/lib/calendar.ts` gera um `.ics` localmente no browser. O evento inclui data, duração, local e link de gestão da marcação.

## Segurança

O acesso directo anónimo a `public.appointments` está revogado.

Os RPCs usam o token como capability. Um token inválido devolve um resultado genérico de marcação inexistente, sem revelar informação do banco.

## Testes

A suite `supabase/tests/appointment_token_phase6.sql` cobre:

- leitura segura por token;
- ausência de IDs internos no DTO;
- slots de remarcação;
- remarcação;
- concorrência da remarcação com booking;
- cancelamento;
- cancelamento de lembretes;
- notificações;
- audit;
- política `contact_only`;
- token inválido;
- grants;
- ausência de fixtures persistentes.