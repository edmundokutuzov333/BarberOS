# BarberOS by Oryon — PRD

## Problema original
SaaS multi-tenant de gestão de barbearias (Moçambique, PT-PT). Três áreas: pública (cliente marca em <40s sem conta), barbearia (agenda operacional), administração Oryon. Lógica crítica no Postgres (Supabase) via funções SECURITY DEFINER; RLS em todas as tabelas; identidade visual fechada (vidro, lilás, Plus Jakarta Sans); Framer Motion; 6 fases.

## Escolhas do utilizador
- Supabase próprio (projecto alseiinjzwjdiwtvkdzy, eu-west-2), migrações corridas via pooler.
- Vite + TypeScript (migrado de CRA).
- Supabase Auth email/palavra-passe.
- Plus Jakarta Sans via Google Fonts (sem Geist).

## Arquitectura
- Frontend: React 19 + TS + Vite 6, Tailwind 3.4 (tokens em `src/styles/tokens.css`), Framer Motion, TanStack Query, React Router 7, `@supabase/supabase-js` 2.86 (Node 20).
- Base de dados: Supabase Postgres. Migrações em `/app/supabase/migrations/*.sql`; runner `python3 scripts/run_sql.py`.
- Seed admin: `python3 scripts/seed_admin.py <email> <pw> <nome> [slug]`.
- Backend FastAPI mantém-se apenas como placeholder (não usado pelo frontend).

## Personas
- Cliente final (telemóvel, sem conta) · Dono/gerente/barbeiro · Equipa Oryon (is_platform_admin).

## Implementado
### Fase 1 — Fundações (2026-06)
- Esquema completo (secção 6) + exclusion constraint anti-sobreposição, índices, planos semeados, trigger `handle_new_user`.
- Funções `is_member`, `is_platform_admin`, `my_barber_id`, `shop_is_public`, `create_barbershop` (owner + horário base seg–sáb 09–19).
- RLS em todas as tabelas; anon só lê barbearias activas/trial, serviços, cortes, barbeiros, horários, avaliações publicadas. Buckets Storage `shop-logos`, `shop-photos`, `barbers`, `haircuts` com política por path `{barbershop_id}/...`.
- Tokens, canvas, `.glass`, tipografia, 10 temas (`src/themes/index.ts`, `applyTheme` injecta variáveis em `<html data-theme>`).
- Layout: sidebar colapsável 76↔264 (spring), pílula `layoutId="nav-active"`, dock flutuante mobile (Agenda, Marcações, Clientes, Relatórios, Mais), transições de página, `useReducedMotion`.
- Auth: /entrar, /registar (metadata → profiles), /recuperar; guardas `RequireAuth`, `RequireAdmin`; ShopProvider com selector de barbearia.
- /app dashboard com KPIs reais (hoje, ocupação, receita, faltas), "A seguir", "Precisa de atenção", estados vazios.
- /app/onboarding passo 1 (criar barbearia via RPC). /admin/barbearias tabela real.
- Ecrãs de fases seguintes mostram estado honesto "entra na Fase X" (NotYet).

### Fase 2 — Configuração + motor (2026-06)
- `0003_engine.sql`: `get_available_slots`, `get_available_days` (day, slots_count, is_open), `book_appointment` (advisory lock + exclusion → SLOT_TAKEN/SLOT_UNAVAILABLE), `enqueue_appointment_notifications`, trigger `on_appointment_completed` (pedido de avaliação +1h, contadores do cliente), `seed_haircut_catalogue` (22 estilos), `list_members`, `add_member_by_email`. Critérios 1–3 validados por `/app/scripts/test_engine.py`.
- Páginas: /app/servicos, /app/cortes, /app/barbeiros (com conta ligada e serviços), /app/horarios (base + override por barbeiro + bloqueios), /app/definicoes/(perfil|pagina|regras|sinal|utilizadores|link).
- Onboarding 9 passos com `onboarding_step` persistido e banner no dashboard; QR + cartaz A5 PNG gerado no cliente; upload para Storage com recorte central (1:1, 16:9, 3:4); reordenação por arrastar (framer Reorder).

## Backlog priorizado
- P0 (Fase 3): página pública `/barbearia/:slug`, assistente 6 passos, RPCs por token (`get_appointment_by_token`, `cancel_by_token`, `reschedule_by_token`), .ics, `/vaga/:token`.
- P1 (Fase 4): agenda dia/semana realtime + arrastar, marcação manual, estados, clientes, notas.
- P1 (Fase 5): notify-dispatch, holds-expire, waitlist SKIP LOCKED, avaliações, médias.
- P2 (Fase 6): M-Pesa/e-Mola, relatórios CSV, admin completo, planos.

## Credenciais de teste
Ver `/app/memory/test_credentials.md`.
