---
name: barberos-ui-design
description: Extend BarberOS premium noir-and-brass UI without breaking Supabase, booking, accessibility or performance contracts.
---
# BarberOS UI design skill

## Visual language
Use `frontend/src/styles/tokens.css`. Brand palette is near-black and antique gold, not bright yellow or purple. Gold is for selection, focus, primary actions and rare details. Keep large surfaces nearly black, borders fine, text warm neutral, and avoid bright gradients or excessive blur.

## Application contracts
- Preserve React, Vite, React Router, TanStack Query, Supabase, Tailwind v3 and current aliases.
- Prefer existing `Button`, `Field`, `Panel`, `EmptyState`, `ErrorState`, `Page`, `Brand` and `StatusChip` components.
- Dashboard values must come from Supabase RPCs and validated schemas. Never insert fake KPI values.
- Keep availability and booking mutations on existing feature hooks/RPCs. Preserve per-shop theme application on public shop and booking routes.
- Never submit test bookings or add fake rows to production.

## Ambient motion
Use `BarberAtmosphere` only as decoration. It combines open-source MicroSlats and muted scissors/straight-razor artwork. Never capture clicks, overlap controls, reduce contrast or compete with task completion. Respect reduced motion and keep animation slow.

## Responsive accessibility
- Test narrow mobile layouts and horizontal overflow.
- Preserve keyboard focus rings, semantic headings, landmarks, and explicit loading/empty/error/disabled/success states.
- Decorative art must be aria-hidden and never focusable.
- Run Playwright/axe and existing CI suites before landing UI changes.

## Component licences
Prefer open-source React Bits components when practical and review runtime cost and reduced-motion behaviour. React Bits Pro registry items require a valid `REACTBITS_LICENSE_KEY`. Never commit that key or copy Pro-only source without appropriate access.
