# BarberOS Phase 20: UI, UX, CX and Service Design

## Objective

Phase 20 consolidates the existing BarberOS visual identity into a predictable, reusable interface system without changing the product's domain model, tenancy rules or critical PostgreSQL business logic.

The visual source remains:

- black canvas
- glass surfaces
- lilac or tenant-selected accent
- diffuse glow
- rounded panel/card geometry
- sentence case
- Geist / Plus Jakarta Sans / Inter fallback
- reduced-motion support

## System foundations

The shared token layer in `frontend/src/styles/tokens.css` is now the single source for:

- canvas and surface colours
- accent colours
- semantic status colours
- border hierarchy
- focus ring
- panel, floating and accent shadows
- panel, card and pill radii

Tailwind exposes the same semantic tokens so component code does not need to duplicate theme values.

## Shared interaction contract

Buttons:

- 40px minimum compact height
- 44px or more for standard controls
- no hover lift
- press feedback only where motion is allowed
- loading state disables the control and exposes `aria-busy`

Inputs:

- shared visual field treatment
- visible focus state
- hover border hierarchy
- error state with `aria-invalid`
- hint/error text wired with `aria-describedby`

Dialogs, chips, toggles, uploads and pagination use the same focus and hit-target language.

## Theme contract

The tenant theme continues to be stored in `barbershops.theme_key`.

Authenticated backoffice:

`ShopProvider -> applyTheme(theme_key) -> document root CSS variables`

Public experience:

`get_public_barbershop(slug) -> shop.theme_key -> applyTheme(theme_key)`

The public barbershop page and booking wizard therefore render with the same tenant-selected theme as the backoffice.

Theme selection is preview-first and persistence-second. Leaving the picker without saving restores the persisted tenant theme.

## Responsive service design

Desktop backoffice uses:

- persistent sidebar
- dense operational panels
- stable page headers
- tabular surfaces for high-density admin work

Mobile backoffice uses:

- fixed navigation dock
- safe-area aware positioning
- expandable "Mais" surface
- minimum touch targets
- horizontal overflow for intentionally dense tables

The public booking surface remains mobile-first and receives the tenant's visual theme.

## Accessibility and resilience

Global behaviour now includes:

- visible `focus-visible` treatment
- reduced-motion handling
- higher-contrast token overrides
- safe-area support for mobile dock
- text rendering optimisation
- disabled-state cursor and opacity semantics
- minimum touch-target sizing on shared controls

No data or decorative placeholders were added. Existing loading, empty, error and success states remain backed by real application queries and mutations.

## Acceptance contract

Phase 20 is accepted when:

1. all existing routes still compile
2. tenant theme selection persists through the existing Supabase path
3. public tenant page reflects the persisted theme
4. public booking wizard reflects the persisted theme
5. shared controls expose visible keyboard focus
6. reduced-motion mode removes continuous motion
7. admin navigation remains usable on desktop and mobile
8. no business table writes or tenancy boundaries are changed by the visual layer
9. production typecheck and build pass in CI
