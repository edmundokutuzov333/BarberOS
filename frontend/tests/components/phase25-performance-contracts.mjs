import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const tests = [
  ['private providers are not imported by the public entry', () => {
    const main = read('src/main.tsx');
    const app = read('src/App.tsx');
    assert.doesNotMatch(main, /from ['"]\.\/lib\/(auth|shop)/);
    assert.doesNotMatch(main, /from ['"]sonner['"]/);
    assert.match(app, /lazy\(\(\) => import\('\.\/components\/layout\/PrivateProviders'\)\)/);
  }],
  ['route surface is lazy-loaded so public entry does not ship internal pages', () => {
    const source = read('src/App.tsx');
    assert.match(source, /lazy\(\(\) => import\('\.\/pages\/PublicBarbershop'\)/);
    assert.match(source, /lazy\(\(\) => import\('\.\/pages\/BookingWizard'\)/);
    assert.match(source, /lazy\(\(\) => import\('\.\/pages\/admin\/AdminDashboard'\)/);
    assert.match(source, /Suspense/);
  }],
  ['public images use browser loading primitives deliberately', () => {
    const source = read('src/pages/PublicBarbershop.tsx');
    assert.match(source, /fetchPriority="high" decoding="async"/);
    assert.match(source, /loading="lazy" decoding="async"/);
    assert.match(source, /width="96" height="96"/);
  }],
  ['non-critical public sections can be deferred by the browser', () => {
    const source = read('src/pages/PublicBarbershop.tsx');
    const css = read('src/index.css');
    assert.match(source, /perf-deferred/);
    assert.match(css, /content-visibility:auto/);
    assert.match(css, /contain-intrinsic-size/);
  }],
  ['public page avoids render-blocking third-party fonts', () => {
    const html = read('index.html');
    const css = read('src/index.css');
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/i);
    assert.doesNotMatch(css, /@import\s+url\(['"]?https?:\/\//i);
    assert.match(css, /font-family:\s*system-ui/i);
  }],
  ['only the landing loads MicroSlats and reacts to the cursor; showcase remains CSS-only', () => {
    const source = read('src/components/background/BarberAtmosphere.tsx');
    assert.ok(source.includes("variant !== 'hero' ?"));
    assert.ok(source.includes('<MicroSlats preset="swell"'));
    assert.ok(source.includes('interactive cursorStrength={0.75} cursorSize={42}'));
    assert.ok(!source.includes('interactive={variant ==='));
    const css = read('src/index.css');
    assert.ok(css.includes('.barber-atmosphere--showcase .barber-atmosphere__slats--showcase'));
    assert.ok(css.includes('background: repeating-linear-gradient('));
    assert.ok(css.includes('rgba(var(--brand-accent-rgb), .22)'));
  }],
  ['public shop uses the showcase background while the landing remains cursor-reactive', () => {
    const app = read('src/App.tsx');
    const atmosphere = read('src/components/background/BarberAtmosphere.tsx');
    assert.match(app, /isPublicShop = \/\^/);
    assert.match(app, /isLanding \? 'hero' : isPublicShop \? 'showcase'/);
    assert.match(app, /setAttribute\('data-barberos-surface', isLanding \? 'landing' : 'platform'\)/);
    const css = read('src/index.css');
    assert.match(atmosphere, /variant !== 'hero'/);
    assert.match(css, /barber-atmosphere--showcase \.barber-atmosphere__slats--showcase/);
    assert.ok(css.includes('rgba(var(--brand-accent-rgb), .22)'));
    assert.match(css, /barber-atmosphere--ambient \.barber-atmosphere__slats--static/);
  }],
  ['every route inherits one centrally managed atmosphere', () => {
    const app = read('src/App.tsx');
    assert.match(app, /useLocation\(\)/);
    assert.match(app, /<BarberAtmosphere variant=\{atmosphereVariant\} \/>/);
    assert.match(app, /\/marcacao/);
    assert.match(app, /\/vaga/);
    assert.match(app, /\/barbearia/);
    for (const file of [
      'src/pages/Landing.tsx',
      'src/pages/auth/Entrar.tsx',
      'src/pages/PublicBarbershop.tsx',
      'src/pages/BookingWizard.tsx',
      'src/pages/AppointmentManage.tsx',
      'src/pages/ReviewSubmit.tsx',
      'src/pages/Vaga.tsx',
      'src/pages/app/NotYet.tsx',
      'src/components/layout/AppShell.tsx',
      'src/components/layout/AdminShell.tsx',
    ]) {
      assert.doesNotMatch(read(file), /<BarberAtmosphere/);
    }
  }],
  ['brand atmosphere is independent of tenant accent themes', () => {
    const tokens = read('src/styles/tokens.css');
    const css = read('src/index.css');
    const source = read('src/components/background/BarberAtmosphere.tsx');
    assert.match(tokens, /--brand-accent-rgb:\s*185,150,79/);
    assert.match(css, /html\[data-barberos-surface="platform"\] body/);
    assert.match(css, /rgba\(var\(--brand-accent-rgb\)/);
    assert.match(source, /color="#b9964f" glintColor="#dfc27b"/);
  }],
  ['theme scope restores exact inline variables and original data-theme', () => {
    const themes = read('src/themes/index.ts');
    const shop = read('src/lib/shop.tsx');
    const publicShop = read('src/pages/PublicBarbershop.tsx');
    const booking = read('src/pages/BookingWizard.tsx');
    assert.match(themes, /captureThemeState/);
    assert.match(themes, /restoreThemeState/);
    assert.match(themes, /root\.style\.removeProperty\(name\)/);
    assert.match(shop, /useScopedTheme\(current\?\.barbershops\.theme_key\)/);
    assert.match(publicShop, /useScopedTheme\(data\?\.shop\.theme_key\)/);
    assert.match(booking, /useScopedTheme\(data\?\.shop\.theme_key\)/);
  }],
  ['the Oryon demonstration has an explicit brand theme migration', () => {
    const themes = read('src/themes/index.ts');
    const html = read('index.html');
    const migration = read('../supabase/migrations/20261018030000_noir_brass_demo_theme.sql');
    assert.match(themes, /key: 'noir-brass',\s+name: 'Noir & latão'/);
    assert.match(html, /data-theme="noir-brass"/);
    assert.match(migration, /where slug = 'oryon'/i);
    assert.match(migration, /theme_key = 'noir-brass'/i);
    assert.match(migration, /to_jsonb\(new\)/i);
  }],
  ['mobile dock does not steal focus on mount and restores focus only after closing', () => {
    const source = read('src/components/layout/MobileDock.tsx');
    assert.ok(source.includes('const wasOpenRef = useRef(false)'));
    assert.ok(source.includes('if (wasOpenRef.current && !open) moreRef.current?.focus()'));
    assert.ok(source.includes('wasOpenRef.current = open'));
  }],
  ['theme picker cleanup follows the last saved theme instead of a stale closure', () => {
    const source = read('src/components/config/ShopForms.tsx');
    assert.match(source, /const savedThemeKey = useRef\(s\.theme_key\)/);
    assert.match(source, /savedThemeKey\.current = s\.theme_key/);
    assert.match(source, /applyTheme\(savedThemeKey\.current\)/);
  }],
  ['landing hero image remains an explicit high-priority asset', () => {
    const source = read('src/pages/Landing.tsx');
    assert.match(source, /images\.pexels\.com\/photos\/17027433/);
    assert.match(source, /alt="Interior de barbearia com cadeiras e iluminação quente"/);
    assert.match(source, /fetchPriority="high" decoding="async"/);
  }],
];

let failed = 0;
for (const [name, run] of tests) {
  try {
    run();
    console.log('PASS', name);
  } catch (error) {
    failed += 1;
    console.error('FAIL', name, error);
  }
}

console.log('Phase 25 performance contracts: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
if (failed) process.exitCode = 1;
