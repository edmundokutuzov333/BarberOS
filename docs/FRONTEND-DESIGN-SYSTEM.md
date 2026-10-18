# BarberOS front-end redesign

## Visual direction

The shared design system is now noir with antique brass: near-black canvas, smoked-charcoal surfaces, warm neutral typography, thin borders and modest highlights. Gold is reserved for the primary action, selected navigation, focus states and a few deliberate details. Operational views stay darker and quieter than the landing page. The tokens are centralised in `frontend/src/styles/tokens.css`; shared components and responsive rules are defined in `frontend/src/index.css`.

## Ambient motion

`BarberAtmosphere.tsx` layers the open-source React Bits MicroSlats canvas with line-art scissors and a straight razor. Scissor blades open and close gently, while the razor has a slow stroke animation. The entire layer is pointer-transparent and `aria-hidden`, and its intensity drops on smaller viewports. MicroSlats is lazy-loaded and non-interactive. On task-focused public/shop/booking surfaces, the slat field draws once and pauses to avoid a continuously running WebGL animation; the scissors and razor retain very subtle CSS movement. The fluid simulation is skipped when interactive mode is disabled, and CSS tool animations are disabled for reduced-motion preferences.

## Functional contracts kept

- App and platform-admin shells share the ambient layer without changing navigation, authorization or role checks.
- Login form remains on the existing Supabase Auth mutation.
- Public shop and booking pages keep their live Supabase-backed catalogue, availability hooks, booking mutation and per-shop theme application.
- Dashboard KPIs still come from the validated `get_dashboard_snapshot` RPC. Public profile links use the active shop's real slug, open the real public route and copy that URL with a visible error message if clipboard access fails.

## React Bits and component licences

The open-source `MicroSlats-JS-CSS` source was added from the official public registry, with `ogl@^1.0.11` added to the dependency manifest and Yarn v1 lockfile. React Bits Starter and Pro registries use `REACTBITS_LICENSE_KEY` supplied by the local/deployment environment, never a credential checked into Git.

The Pro-only `profile-5` block was not copied because it requires a valid Pro licence. Its useful profile/link pattern is adapted with native BarberOS components and real shop data rather than shipping paid, unavailable source.

## Validation scope

The Playwright smoke suite now asserts that the decorative layer exists and is hidden from assistive technology on the landing, login and password-recovery routes. CI still runs typecheck, build, unit/component contracts, E2E, accessibility and performance gates. This document records the implemented design and automated coverage; it does not claim manual certification of every page/browser/device.
