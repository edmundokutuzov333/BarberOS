# BarberOS Phase 13: Waitlist Engine

A FASE 13 fecha o ciclo da lista de espera como uma peça real de domínio, ligada ao Availability Engine, Booking Engine, Notifications queue e às interfaces pública e operacional.

## Percurso de serviço

Sem vaga na data escolhida
-> cliente entra na lista sem conta
-> pedido fica em estado waiting
-> uma vaga é libertada por cancelamento ou remarcação
-> o PostgreSQL procura o primeiro cliente elegível
-> uma única oferta é criada
-> a oferta dura 15 minutos
-> cliente recebe uma referência de oferta
-> cliente aceita
-> Booking Engine cria a marcação com source=waitlist
-> entrada fica converted

Quando a oferta expira:
waiting -> offered -> expired
-> o mesmo slot é imediatamente entregue ao próximo cliente elegível.

## Rotas

`/app/lista-espera`

Área operacional com métricas, pesquisa, filtros, posição na fila, janela de datas, período, barbeiro pretendido, vaga oferecida, contagem regressiva e cancelamento da entrada.

`/vaga/:token`

Página pública da oferta. O token é a única identidade pública da oferta. A página permite aceitar a vaga e, quando necessário, contactar a barbearia por WhatsApp.

## PostgreSQL

O engine principal é:

- `private.waitlist_period_matches`
- `private.offer_next_waitlist_core`
- `public.join_waitlist`
- `public.offer_next_waitlist`
- `public.get_waitlist`
- `public.get_waitlist_metrics`
- `public.get_waitlist_offer`
- `public.claim_waitlist_offer`
- `public.expire_waitlist_offer`
- `public.cancel_waitlist`

A tabela `waitlist_entries` não recebe DML directo do frontend.

## Elegibilidade

Uma pessoa só recebe uma oferta quando:

- a loja está activa ou em trial
- o serviço continua activo
- o barbeiro pretendido continua activo, quando especificado
- o corte continua pertencente à loja/serviço, quando especificado
- a data da vaga está dentro do intervalo pedido
- o período pedido coincide com a hora local da vaga
- o Availability Engine confirma o mesmo slot para o serviço e barbeiro

## Concorrência

A oferta usa um advisory lock por:

`shop + barber + slot`

Existe também uma unique partial index para impedir mais de uma oferta activa no mesmo slot.

O candidato é seleccionado com:

`FOR UPDATE SKIP LOCKED`

A entrada permanece bloqueada durante a transacção que escolhe o candidato.

A aceitação não adquire primeiro o lock da waitlist e depois o lock de booking. O próprio registo da oferta já é bloqueado com `FOR UPDATE`; depois o claim passa directamente para `book_appointment_core`, mantendo a ordem de locks compatível com o Booking Engine.

As entradas idênticas da lista usam advisory lock próprio para tornar o dedupe seguro contra submissions concorrentes.

## Libertação de vagas

Foi criado o trigger:

`appointments_waitlist_slot_released`

O trigger observa mudanças no `appointments` e encaminha a vaga antiga para o waitlist core quando:

- uma marcação activa é cancelada
- uma marcação activa é remarcada para outra hora
- uma marcação activa muda de barbeiro

Assim, não existem múltiplos caminhos paralelos para a mesma regra.

## Token público

O token da oferta é um UUID aleatório e não expõe:

- appointment_id
- customer_id
- barbershop_id

`get_waitlist_offer` devolve apenas os dados necessários para explicar a oportunidade ao cliente.

Depois do claim, o cliente recebe o `manage_token` normal da marcação e continua o percurso em `/marcacao/:token`.

## Notificações

A FASE 13 cria entradas na fila `notifications` com `template_key=waitlist_offer`.

Canais:

- WhatsApp
- Email quando existe email

O dispatcher real, retries, fallback e cron continuam como responsabilidade da FASE 14 e FASE 15.

## UX, CX e Service Design

O sistema não mostra ao cliente um conceito técnico de fila. A interface explica:

- que a disponibilidade mudou
- que pode deixar os dados
- que a fila é por ordem de entrada
- que a oferta é temporária
- que só uma pessoa recebe aquela oportunidade

No backoffice, a equipa vê a operação como uma fila accionável, não como uma tabela técnica.

## Aceitação

`supabase/tests/waitlist_phase13.sql` valida:

- grants e boundaries
- ausência de DML directo
- entrada pública sem conta
- deduplicação
- oferta automática após cancelamento
- exactamente uma oferta activa por slot
- leitura pública via token
- claim como marcação real
- `source=waitlist`
- conversão da entrada
- nova oferta após libertação do slot
- expiração
- rotação para o próximo cliente
- leitura operacional
- métricas

Os fixtures são transaccionais e sofrem rollback. Não existe seed de clientes ou marcações falsas na aplicação.