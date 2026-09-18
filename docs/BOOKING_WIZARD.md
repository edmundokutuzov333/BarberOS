# BarberOS Booking Wizard

## Rota

`/barbearia/:slug/marcar`

O wizard é público e não requer autenticação.

## Percurso

1. Serviço
2. Corte
3. Barbeiro
4. Data
5. Hora
6. Dados do cliente

As escolhas operacionais ficam em `searchParams` para permitir refresh e partilha do estado do percurso sem colocar PII do cliente na URL. Nome, telefone e email ficam apenas no estado da página até à submissão.

## Fonte de verdade

O catálogo inicial vem de `get_public_barbershop(slug)`.

Os dias são obtidos por `get_available_days`.

Os horários são obtidos por `get_available_slots`.

A criação é feita exclusivamente por `book_appointment()`.

O frontend não escreve directamente em `appointments` ou `customers`.

## Qualquer barbeiro

Quando o cliente escolhe "Qualquer barbeiro", o frontend envia `p_barber_id = null`. O Booking Engine resolve um barbeiro elegível dentro do PostgreSQL e volta a verificar a disponibilidade antes da inserção.

Quando o cliente escolhe um barbeiro, o respectivo ID público é enviado e o backend valida tenant, estado activo e disponibilidade.

## Estado e concorrência

A UI actualiza a disponibilidade periodicamente e nunca trata um slot apresentado como garantia.

Se o backend responder `SLOT_TAKEN` ou `SLOT_UNAVAILABLE`, o slot é removido do estado público e o cliente regressa ao passo de hora para escolher outra opção.

A exclusão de overlap e o advisory lock existentes no Booking Engine continuam a ser a última barreira.

## Sinal

O resumo usa a mesma configuração pública necessária para explicar:

- modo percentagem ou valor fixo
- valor configurado
- período de hold
- preço do serviço

O valor final continua a ser calculado e validado pelo PostgreSQL. O wizard apenas antecipa a informação para UX.

## Regras de tenant

O payload público nunca expõe IDs de tenant, customer IDs, appointment IDs ou manage tokens.

Os IDs de serviço, corte e barbeiro são referências públicas opacas necessárias para as chamadas de disponibilidade e booking. A autorização e pertença ao tenant são sempre revalidadas no backend.

## Acessibilidade e CX

O wizard inclui:

- progresso explícito por passo
- estados loading, empty e error
- focus visível
- navegação por teclado
- `aria-current`, `aria-selected` e mensagens live
- acções móveis fixadas no fundo
- resumo persistente em desktop
- validação local antes da chamada RPC
- estados sem catálogo ou sem barbeiros elegíveis

## Pós-marcação

Depois de `book_appointment()` devolver o `manage_token`, o cliente é encaminhado para `/marcacao/:token`, usando a superfície de gestão entregue na Fase 6.

A entrega real por WhatsApp/email continua dependente do Notifications Dispatcher, previsto nas fases seguintes.
