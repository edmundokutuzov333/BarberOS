# BarberOS Phase 12: Customer CRM

A FASE 12 entrega o CRM operacional de clientes como uma fatia vertical completa entre PostgreSQL, Supabase RPC, React e a experiência de operação da barbearia.

## Percurso funcional

Cliente faz uma marcação online ou presencial
-> o Booking Engine cria ou actualiza o cliente
-> a marcação entra na agenda
-> o cliente passa a existir no CRM
-> conclusão incrementa visitas e actualiza última visita
-> no-show incrementa faltas
-> o operador pode consultar e actualizar a ficha
-> o histórico é derivado das marcações reais

Não há seed de clientes nem dados fictícios na aplicação.

## Rotas

`/app/clientes`

Lista operacional com pesquisa por nome, telefone ou email, filtros por próxima marcação, faltas e clientes sem visita, métricas e paginação.

`/app/clientes/:customerId`

Ficha operacional com contacto rápido, edição de dados, preferências, notas, resumo de actividade, próxima marcação, último atendimento e histórico de marcações.

## Boundary de dados

A interface não faz INSERT, UPDATE ou DELETE directo na tabela `customers`.

As operações CRM usam:

- `get_customer_metrics`
- `get_customers`
- `get_customer`
- `get_customer_appointments`
- `update_customer`

Todas as funções CRM exigem sessão autenticada. O PostgreSQL valida o tenant em cada chamada através de `private.require_agenda_access`.

## Isolamento de papéis

Owner e Manager podem operar o CRM completo da loja.

Barber só pode consultar ou editar clientes com uma marcação ligada ao seu próprio perfil. Contagens, última visita, serviços, cortes, histórico e gasto são calculados dentro desse escopo.

Platform Admin mantém o alcance transversal já definido pelo domínio através de `private.is_platform_admin`.

## Pesquisa

A pesquisa corre no PostgreSQL. `pg_trgm` está instalado no schema `extensions`, com índices trigram para nome, telefone e email.

## Escrita

`update_customer` valida:

- nome entre 2 e 120 caracteres
- telefone moçambicano canónico
- email até 254 caracteres e formato mínimo
- notas até 2000 caracteres
- preferências como objecto JSON até 8192 bytes
- unicidade por loja + telefone

A alteração cria um registo em `audit_logs`.

## Segurança

As permissões directas de INSERT, UPDATE e DELETE em `customers` para `anon` e `authenticated` foram revogadas.

O Booking Engine continua capaz de actualizar clientes através das suas funções `SECURITY DEFINER`, porque a criação/actualização do cliente durante uma marcação pertence ao domínio de booking e não ao CRUD do frontend.

## UX, CX e Service Design

A lista começa com os indicadores que ajudam o operador a perceber rapidamente a base de clientes.

A pesquisa usa `useDeferredValue` para não bloquear a interface durante a introdução de texto.

Desktop usa tabela para densidade operacional. Mobile usa cartões para leitura rápida e toque confortável.

A ficha prioriza contacto, próxima marcação e histórico, deixando detalhes secundários numa coluna própria.

Todos os fluxos têm loading, empty e error states. A edição é opcional e preserva o trabalho enquanto a mutation está em curso.

## Aceitação

A suite `supabase/tests/customer_crm_phase12.sql` verifica:

- grants das cinco funções
- bloqueio de acesso anónimo às RPCs CRM
- bloqueio de DML directo em `customers`
- métricas reais
- pesquisa
- filtro `never_visited`
- leitura da ficha
- histórico vazio sem dados artificiais persistentes
- actualização da ficha
- normalização do telefone
- unicidade de telefone
- isolamento cross-tenant
- audit log

Todos os fixtures são executados numa transacção com rollback.
