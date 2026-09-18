# Manual Booking

A marcação manual é a operação de balcão do BarberOS para Owner, Manager e, dentro do próprio âmbito, Barber.

## Princípio

Não existe um segundo motor de marcações.

Online e presencial usam o mesmo core PostgreSQL:

- validação de loja, serviço, corte e barbeiro
- normalização do número moçambicano
- resolução de barbeiro quando necessário
- lock transaccional por barbeiro
- revalidação da disponibilidade
- customer upsert por loja + telefone
- cálculo do sinal
- criação da appointment
- exclusão de overlap
- fila de notificações
- audit log

A diferença é apenas a origem:

`book_appointment(...)` → `source=online`

`book_appointment_manual(...)` → `source=manual` e `created_by=auth.uid()`

## Permissões

Anonymous não pode executar a operação manual.

Owner e Manager podem criar uma marcação para qualquer barbeiro elegível da própria loja.

Barber só pode criar uma marcação para o seu próprio perfil de barbeiro. O PostgreSQL rejeita tentativas de atribuir outro barbeiro.

Platform Admin mantém o âmbito global do backend, mas a operação normal continua dentro da área da loja.

## Fluxo da UI

A partir de `/app/agenda`, o operador abre `Nova marcação`.

1. Serviço
2. Corte opcional
3. Barbeiro, ou qualquer barbeiro disponível para Owner/Manager
4. Data
5. Horário real da disponibilidade
6. Nome, telefone, email e nota interna opcional

O frontend lê serviços, cortes e barbeiros activos através de consultas protegidas e obtém dias/horários através do mesmo Availability Engine.

A submissão nunca escreve directamente em `appointments`. Chama apenas `book_appointment_manual`.

## Sinal

O cálculo do depósito continua a ser o definido para a loja + serviço.

Quando existe sinal, a appointment fica `pending` com `deposit_status=awaiting` e o hold usa a mesma configuração do booking online.

Quando não existe sinal, a appointment entra como `confirmed`.

## Experiência depois da criação

A UI apresenta:

- dia e hora
- barbeiro efectivamente atribuído
- duração
- estado
- valor do sinal, quando aplicável
- link público de gestão da marcação
- botão para abrir WhatsApp com mensagem pré-preenchida
- acesso imediato à Agenda

## Dados e auditoria

A marcação manual fica identificada por `source=manual`.

O actor fica registado em `created_by`.

A nota interna fica na appointment e não é enviada para o cliente pelo contrato público.

A criação também entra em `audit_logs` e na fila `notifications`.

## Concorrência

A UI mostra apenas horários disponíveis, mas o servidor volta a verificar a disponibilidade dentro da transacção.

A advisory lock e a exclusion constraint continuam a proteger o último metro. Uma marcação presencial concorrente contra uma marcação online no mesmo slot recebe `SLOT_TAKEN` e não cria uma segunda appointment.

## Realtime

Depois da criação, o evento `INSERT` de `appointments` é publicado no Supabase Realtime. A Agenda dos operadores é invalidada e sincronizada sem refresh manual.
