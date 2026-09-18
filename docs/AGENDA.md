# BarberOS Operational Agenda

## Rota

`/app/agenda`

A agenda é uma superfície operacional autenticada e tenant-scoped.

## Leitura

O frontend usa dois RPCs:

- `get_agenda_appointments(shop, from, to)`
- `get_agenda_schedule(shop, from, to)`

Owner e Manager vêem as marcações da loja. Barber vê apenas as próprias marcações.

O intervalo máximo de leitura é 14 dias.

A agenda não faz SELECT directo para construir o read model. O PostgreSQL resolve tenant, papel, barbeiro, cliente, serviço, corte e schedule override.

## Máquina de estados

As alterações passam por `transition_appointment()`.

Transições:

- pending → confirmed
- confirmed → in_progress
- in_progress → completed
- confirmed → no_show
- pending/confirmed → cancelled

A confirmação de uma marcação com sinal exige `deposit_status = paid` ou `not_required`.

Conclusão e no-show continuam a usar o trigger de domínio existente para actualizar o CRM operacional.

Cancelamento interrompe reminders pendentes, cria notificação e auditoria.

## Remarcação

`reschedule_appointment_by_operator()` usa o mesmo Availability Engine.

A operação valida:

- tenant
- papel
- appointment futuro
- estado pending/confirmed
- barbeiro activo
- associação do barbeiro ao serviço
- data/hora
- disponibilidade real

A operação pode alterar o barbeiro. Quando isso acontece, são adquiridos advisory locks determinísticos para os dois barbeiros, evitando deadlocks entre operações concorrentes.

A exclusion constraint continua a ser a última barreira contra overlap.

## UI

Dia:

- timeline por barbeiro
- horários reais da loja
- linha de hora actual
- blocos proporcionais à duração
- drag-to-reschedule
- acções de atendimento
- WhatsApp

Semana:

- sete colunas de dia
- carga diária
- cliente, serviço, barbeiro e estado
- acesso rápido a remarcação/confirmação/WhatsApp

Remarcação manual abre o conjunto de slots reais para o serviço/barbeiro.

## Segurança

Os RPCs da agenda são executáveis apenas por `authenticated`.

Não existe UPDATE directo de `appointments` pelo cliente autenticado.

As funções de agenda usam `SECURITY DEFINER` com `search_path=""`.

## UX / acessibilidade

A agenda inclui:

- loading
- erro
- empty
- feedback de sucesso por toast
- foco visível
- labels em acções
- `aria-pressed` nos modos Dia/Semana
- drag apenas para estados remarcáveis
- timezone da própria loja
- datas de agenda agrupadas pela timezone da loja
