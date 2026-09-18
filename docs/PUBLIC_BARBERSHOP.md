# BarberOS Public Barbershop Surface

## Rota

`/barbearia/:slug` é a página pública tenant-scoped da barbearia.

## Fonte de dados

A página usa exclusivamente `get_public_barbershop(slug)`. O browser anónimo não faz SELECT directo às tabelas do domínio para construir o perfil.

O RPC devolve:

- perfil público da barbearia;
- serviços activos;
- cortes activos;
- barbeiros activos e serviços associados;
- horário semanal da loja;
- média e contagem das avaliações publicadas;
- até seis avaliações publicadas mais recentes.

## Segurança

O RPC é `SECURITY DEFINER`, tem `search_path=""` e grants explícitos.

O papel `anon` não possui SELECT directo em barbershops, services, haircuts, barbers, barber_services, working_hours, reviews, schedule_overrides, customers, appointments, notifications, waitlist_entries, payments ou audit_logs.

Os identificadores de serviços, cortes e barbeiros são apenas referências opacas necessárias para as camadas públicas seguintes. IDs de tenant e dados operacionais internos não fazem parte do payload.

## UI / UX / CX

A página mantém o sistema visual existente do BarberOS: glass, preto, lilás, cantos arredondados e tipografia do produto.

Tem estados explícitos de loading, erro e empty. Não há placeholders de catálogo ou reviews.

Quando existe contacto, a superfície oferece WhatsApp, telefone, Instagram e mapa conforme os dados realmente preenchidos pela barbearia.

Sem cover ou logo, a UI usa apenas composição visual e inicial do nome. Não é descarregada nenhuma imagem artificial.

## Reputação

A reputação apresentada é baseada somente em reviews publicadas e nos agregados já mantidos para cada barbeiro.

## Horários

Os horários mostrados são os horários semanais da loja. Excepções de data e regras de disponibilidade continuam a ser responsabilidade do Availability Engine, não desta página.

## Booking

A página não duplica o Booking Engine. A marcação online será acrescentada na Fase 8 através dos RPCs já existentes para disponibilidade e booking.