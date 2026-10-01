# Fase 0: Matriz Repo

| Área | BarberOS oficial | barberflow-pro auxiliar | Decisão |
|---|---|---|---|
| Domínio BarberOS | Forte | Parcial | BarberOS é fonte de verdade |
| Schema PostgreSQL | Forte e real | Duplicado em migrations | Preservar BarberOS |
| Booking engine | Implementado | Não presente no estado funcional observado | Preservar BarberOS |
| Availability engine | Implementado | Especificado, não fechado | Preservar BarberOS |
| RLS | Existente | Existente, mais permissivo em pontos importantes | Auditar BarberOS na Fase 1 |
| Frontend | Funcionalidade inicial | Chassis moderno | BarberOS continua principal |
| Routing | React Router | TanStack Router | Não migrar por tecnologia |
| Server boundary | Simples | Mais explícito | Trazer padrões seleccionados |
| UI | Sistema completo | Sistema coerente | Identidade do BarberOS prevalece |
| Themes | 10 | 10 | Preservar BarberOS |
| Testes | RPC + RLS | Menos domínio | Expandir testes no BarberOS |
| Realtime | Ausente | Ausente no baseline | Implementar na fase própria |
| Cron | Ausente | Não demonstrado | Implementar na fase própria |
| Payments | Modelo de dados | Modelo de dados | Implementar no BarberOS |
| Waitlist | Modelo de dados | Modelo de dados | Implementar no BarberOS |
| Admin | Inicial | Inicial | Expandir no BarberOS |
| Migration source of truth | Problema de drift | schema.ts vazio | Normalizar no BarberOS |
| Design language | Preto + vidro + lilás | Preto + vidro + lilás | BarberOS |
| Segurança de produção | Requer hardening | Requer hardening | Fase 1 |

## Princípio

O segundo repositório não será fundido como projecto.

Serão extraídos apenas padrões arquitecturais que melhorem o BarberOS sem alterar a fonte de verdade do domínio.

Nenhuma decisão da matriz autoriza alteração nesta Fase 0.
