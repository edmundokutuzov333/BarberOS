# BarberOS front-end redesign

## Visual direction

The shared design system is now noir with antique brass: near-black canvas, smoked-charcoal surfaces, warm neutral typography, thin borders and modest highlights. Gold is reserved for the primary action, selected navigation, focus states and a few deliberate details. Operational views stay darker and quieter than the landing page. The tokens are centralised in `frontend/src/styles/tokens.css`; shared components and responsive rules are defined in `frontend/src/index.css`.

## Ambient motion

`App.tsx` owns one route-aware `BarberAtmosphere` layer, so the landing, authentication, customer links, shop/booking flows, staff workspace, administration, loading states and not-found routes share the same visual foundation. The landing keeps its original hero treatment and is the only route that enables MicroSlats pointer/fluid response. The public shop page uses the same MicroSlats renderer in a slower, non-interactive showcase mode, with CSS slats underneath as a fallback while the shader loads or when WebGL2 is unavailable. Forms and token-driven customer flows use a quieter static treatment. Staff and admin pages share the same noir/brass canvas at lower intensity. The brand background is independent of tenant themes; tenant accent variables apply only to foreground UI surfaces. Scoped theme application captures and restores the exact previous inline CSS variables and `data-theme` attribute, preventing one route's theme from leaking into another. The showcase pauses the slat animation for reduced-motion users; scissor and straight-razor line art remains decorative and respects reduced-motion preferences.

## Functional contracts kept

- App and platform-admin shells share the ambient layer without changing navigation, authorization or role checks.
- Login form remains on the existing Supabase Auth mutation.
- Public shop and booking pages keep their live Supabase-backed catalogue, availability hooks, booking mutation and per-shop theme application.
- Dashboard KPIs still come from the validated `get_dashboard_snapshot` RPC. Public profile links use the active shop's real slug, open the real public route and copy that URL with a visible error message if clipboard access fails.

## React Bits and component licences

The open-source `MicroSlats-JS-CSS` source was added from the official public registry, with `ogl@^1.0.11` added to the dependency manifest and Yarn v1 lockfile. React Bits Starter and Pro registries use `REACTBITS_LICENSE_KEY` supplied by the local/deployment environment, never a credential checked into Git.

The Pro-only `profile-5` block was not copied because it requires a valid Pro licence. Its useful profile/link pattern is adapted with native BarberOS components and real shop data rather than shipping paid, unavailable source.

## Validation scope

The route-aware background and its hero-only pointer interaction have static regression contracts in the Phase 25 suite. The smoke suite covers the public landing, login and recovery routes, with typecheck, build, component contracts, E2E, accessibility and asset budgets executed through CI. This is automated coverage, not a claim of manual certification across every page, browser and device.
