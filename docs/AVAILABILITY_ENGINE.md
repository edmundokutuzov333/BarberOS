# BarberOS Availability Engine 2.0

## Contrato

A disponibilidade tem uma única fonte de verdade: PostgreSQL.

Entrada principal:

- slug da barbearia
- serviço
- barbeiro opcional
- data

As funções públicas são:

- get_available_slots
- get_available_days

O browser apenas apresenta o resultado.

## Ordem de resolução do horário

Para cada barbeiro elegível, o motor resolve o horário nesta ordem:

1. excepção do barbeiro para a data
2. excepção da loja para a data
3. override semanal do barbeiro
4. horário semanal base da loja

Uma excepção fechada produz janela nula. Uma excepção aberta substitui completamente o horário semanal desse âmbito.

## Critérios temporais

O slot só é válido quando:

- a loja está em trial ou active
- o serviço está activo e pertence à loja
- o barbeiro está activo e faz o serviço
- a data não está no passado
- a data está dentro de max_advance_days
- o início respeita min_lead_time_min
- o serviço termina dentro da janela
- a janela tem fecho estritamente posterior à abertura

## Ocupação

Bloqueiam disponibilidade:

- appointments confirmed
- appointments in_progress
- appointments pending com hold ainda válido
- time_blocks da loja
- time_blocks do barbeiro

Appointments cancelados, concluídos e no-show não bloqueiam novos slots.

## Intervalo do slot

O motor gera a grelha usando slot_interval_min, mas testa a duração real do serviço contra cada janela. Portanto um serviço de 40 minutos numa grelha de 15 minutos ocupa um intervalo contínuo de 40 minutos e impede slots cujo intervalo se sobreponha, mesmo que o início esteja a 15 ou 30 minutos de distância.

## Any barber

Quando p_barber_id é nulo, um mesmo horário pode devolver vários barber_ids. O booking seguinte pode escolher um deles sob a mesma regra de disponibilidade.

## Dias especiais

Owner/manager pode criar:

- feriado ou folga: dia fechado
- horário especial: nova abertura/fecho
- excepção específica de um barbeiro

A interface vive em /app/horarios e escreve através de RPC.

## Segurança

schedule_overrides não é legível anon. O cliente público consulta apenas as funções SECURITY DEFINER destinadas à disponibilidade.

## Regressão

A suite está em supabase/tests/availability_phase4.sql e cobre:

- slot baseline
- limite de antecedência
- override fechado
- override específico do barbeiro sobre override da loja
- 40 minutos vs grelha de 15
- pending expirado
- confirmed ocupado
- intervalo especial inválido
