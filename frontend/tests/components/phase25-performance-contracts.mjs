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
  ['only the landing atmosphere responds to the cursor', () => {
    const source = read('src/components/background/BarberAtmosphere.tsx');
    assert.match(source, /interactive=\{variant === 'hero'\}/);
    assert.match(source, /cursorStrength=\{variant === 'hero' \? 0\.75 : 0\.25\}/);
    assert.match(source, /cursorSize=\{variant === 'hero' \? 42 : 32\}/);
  }],
  ['every route inherits one centrally managed atmosphere', () => {
    const app = read('src/App.tsx');
    assert.match(app, /useLocation\(\)/);
    assert.match(app, /<BarberAtmosphere variant=\{atmosphereVariant\} \/>/);
    assert.match(app, /\/marcacao/);
    assert.match(app, /\/vaga/);
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
