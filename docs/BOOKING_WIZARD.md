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

## Email do cliente e notificações

O email do cliente é opcional no percurso público. Quando está vazio, o backend guarda a marcação sem email e não cria uma notificação por email; as notificações por WhatsApp e a sua entrega dependem da configuração real do provider. O ecrã de marcação deve instruir o cliente a guardar o link de gestão apresentado após a confirmação. Não assumir que uma notificação foi enviada apenas porque a marcação foi criada.

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

Os IDs de serviço, corte, barbeiro e artigos publicados são referências opacas limitadas aos registos públicos necessários às chamadas. A autorização e pertença ao tenant são sempre revalidadas no backend. A autorização e pertença ao tenant são sempre revalidadas no backend.

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


## Fase 3: catálogo público

O wizard consulta `get_public_shop_catalog(p_slug)` apenas quando `VITE_SHOP_PUBLIC_CATALOG_ENABLED=true` no build e acrescenta o passo opcional Loja somente quando a resposta do backend indica que a flag do tenant está activa. O gate global fica desligado por defeito; `shop_enabled` é a segunda barreira por tenant. Com a flag desligada, o percurso actual de seis passos é preservado. O catálogo expõe apenas categorias/produtos/variantes activos, preço e disponibilidade booleana; stock físico, reservas, dados de cliente, marcações e metadados privados de imagem não são devolvidos.

A selecção permanece no estado da página e **não** é guardada como pedido nesta fase. Para evitar uma falsa confirmação, uma marcação não pode ser submetida enquanto existirem artigos seleccionados. A acção explícita «Continuar sem produtos» limpa a pré-selecção e permite continuar a marcação normal. A flag deve permanecer desligada até à Fase 4 integrar a transacção segura de marcação+pedido.


## Fase 4: pedido atómico com a marcação

Quando o gate global `VITE_SHOP_PUBLIC_CATALOG_ENABLED` está activo e a barbearia tem `shop_enabled=true`, o wizard envia `p_shop_items` com IDs de variante, quantidade, preferências configuradas e modo de consumo. Não envia preços nem totais. A Edge Function valida o envelope, calcula um fingerprint SHA-256 determinístico do payload comercial normalizado e invoca `book_appointment_with_shop_order_idempotent` com a chave de idempotência.

O PostgreSQL revalida tenant, publicação, variante, preço corrente, opções, modo de consumo e stock sob lock. A criação da marcação, do pedido, dos snapshots de linhas, das reservas e da resposta idempotente ocorre numa única transacção. Se qualquer validação falhar, toda a operação é revertida. Repetir a mesma chave e o mesmo fingerprint devolve o mesmo resultado; reutilizar a chave com outro fingerprint é rejeitado. O preço vem sempre da variante no servidor. O wizard limita a selecção a 20 variantes e exige modo de consumo para produtos que suportam ambas as modalidades.

A reserva não reduz imediatamente `stock_on_hand`; o saldo disponível é stock físico menos reservas activas. Cancelar a marcação cancela o pedido associado quando este ainda não foi entregue e liberta as reservas. O resumo persistido é obtido por `shop_order.get` no token gateway, protegido pelo token de gestão existente. O pedido não representa pagamento; o pagamento dos produtos permanece fora do escopo desta fase.

A feature flag global deve permanecer desligada até ao schema de produção e o historial de migrations serem reconciliados, Turnstile estar configurado, a suite de aceitação dedicada estar disponível e o gate de performance passar.
