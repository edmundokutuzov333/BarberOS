# Referência de RPCs

As definições vigentes são as últimas `create or replace function` na cadeia de `supabase/migrations/`. Esta referência começa pelos contratos críticos e mantém a regra de não editar migrações aplicadas.

| RPC | Fronteira | Regra |
|---|---|---|
| `book_appointment` | Edge `booking-create` | Apenas `service_role`; reserva pública com rate limit, Turnstile e idempotência |
| `book_appointment_manual` | Painel autenticado | Operador tenant-scoped; barbeiro apenas no próprio perfil |
| `get_public_barbershop` | Browser público | Apenas dados publicados do tenant |
| `get_available_days` / `get_available_slots` | Browser público | Leitura de disponibilidade calculada no PostgreSQL |
| `get_appointment_by_token` | Token público | DTO público; nunca expor IDs internos desnecessários |
| `cancel_appointment_by_token` | Token público | Deve respeitar expiração e política de cancelamento |
| `reschedule_appointment_by_token` | Token público | Deve respeitar expiração, disponibilidade e política da loja |
| `submit_review_by_token` | Token público | Só marcações concluídas e uma avaliação por marcação |
| `rate_limit_consume` | Edge service role | Contador commitado fora da transação da reserva |

Para a lista integral de funções públicas e a auditoria de grants, usar:

```sh
rg -n "create or replace function public\\." supabase/migrations
```

A lista integral de permissões anon deve ser versionada em `supabase/tests/anon_allowlist.txt` assim que a conexão de staging estiver disponível. A criação do staging, secrets e execução das queries de auditoria não pode ser falsificada por um resultado local sem base Supabase.
