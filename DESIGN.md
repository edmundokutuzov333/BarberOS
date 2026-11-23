---
version: alpha
name: BarberOS
description: "Noir and antique brass operational workspace for barbershops"
colors:
  canvas: "#050504"
  accent: "#b9964f"
  accentSoft: "#dfc27b"
  accentInk: "#171208"
  textHi: "#f7f4ec"
  textMid: "#aca698"
  textLo: "#777162"
  danger: "#e88791"
  success: "#7bd3a7"
typography:
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: "1.5"
rounded:
  panel: "1.35rem"
  card: ".95rem"
  pill: "9999px"
omitted:
  - section: spacing
    reason: "Existing shared component recipes and Tailwind utilities own spacing; no new scale is introduced."
components:
  button: {}
  field: {}
  textarea: {}
  panel: {}
  confirmation: {}
---

# BarberOS design context

## Overview

A working barbershop's dark counter, warm brass fittings and legible appointment
ledger ground the established noir/brass identity. Staff need dependable controls
while serving clients; task clarity leads in the private workspace. Public routes
carry more brand expression through the existing decorative atmosphere.

This records the maintained design system in `docs/FRONTEND-DESIGN-SYSTEM.md`.
The older lilac direction in `docs/PHASE_20_UI_UX.md` is historical; the current
shared runtime and maintained guide establish noir/brass. No rebrand is introduced.
Portuguese copy follows the project's Mozambique context; Gmail remains Portuguese.
This document does not certify the unfinished application-wide language switch.

Token ownership is model B: `frontend/src/styles/tokens.css` and
`frontend/src/index.css` remain canonical. This file mirrors their accepted values;
components consume existing semantic classes. Tenant themes can change foreground
accent variables without changing the platform atmosphere. Avoid neon decoration,
new local design systems, and marketing treatments in operational forms.

## Colors

Warm neutral text sits on near-black surfaces. Brass identifies primary actions,
selection and focus. Status colors retain distinct meaning: success for completed
actions, danger for errors and destructive intent. Colors are never the only status
indicator. Light mode is not part of the established platform treatment.

## Typography

The actual body uses the system stack above, 14px and 1.5 line-height. Shared
`t-title`, `t-card`, `t-body` and `t-label` classes own hierarchy. Portuguese accents
must survive storage, transport and rendering. Do not substitute the older guide's
font claims for the installed runtime stack.

## Layout

Page owns the header; Panel owns content grouping. Existing Tailwind breakpoints
stack controls on phones. Gmail uses one column below `lg` and a list/detail grid
above it. The message history alone has bounded scrolling; forms retain natural
height. Actions and long addresses must remain reachable at narrow widths.

## Elevation & Depth

Use existing glass surfaces, subtle borders and shared shadows. Confirmation
portals use the existing overlay and a scrollable viewport-bounded panel.
Decorative atmosphere stays outside the content hierarchy.

## Shapes

The frontmatter mirrors existing panel, card and pill tokens. Shared controls retain
their recipes; do not reinterpret every element as a pill.

## Components

| Document token | Runtime owner | Consumers |
|---|---|---|
| colors.canvas | `--canvas-void` | document background |
| colors.accent / accentSoft / accentInk | `--accent` / `--accent-soft` / `--accent-ink` | Button, focus, selected rows |
| colors.textHi / textMid / textLo | `--text-hi` / `--text-mid` / `--text-lo` | shared text utilities |
| colors.danger / success | `--st-noshow` / `--st-done` | validation, connection status |
| typography.body | body in `frontend/src/index.css` | page copy and controls |
| rounded.panel / card / pill | corresponding `--radius-*` | shared surfaces |

Button owns intent, hover/focus, disabled and busy treatment. Field and Textarea
own labels and accessible errors. Gmail uses a named non-resizable Textarea variant
with adequate rows. AlertDialog owns confirmation semantics and least-destructive
initial focus. Sonner owns toast feedback. See `UX-CONTRACT.md` for behavior.

## Do's and Don'ts

Preserve the established tokens, real tenant context, keyboard behavior and error
recovery. Confirm changes through browser interaction and accessible state checks.
Do not certify the whole application from a static audit or a Gmail fixture.
