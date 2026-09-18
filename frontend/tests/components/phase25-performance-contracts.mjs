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
  ['font stylesheet cannot block the first render', () => {
    const source = read('index.html');
    assert.match(source, /rel="preload"/);
    assert.match(source, /as="style"/);
    assert.match(source, /onLoad=/);
    assert.match(source, /<noscript>/);
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
