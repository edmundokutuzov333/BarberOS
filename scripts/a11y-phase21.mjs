import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('frontend/src');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) files.push(full);
  }
}

walk(root);

const failures = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);

  if (/['"`](?:Loading|Carregando)\.\.\.['"`]/i.test(source)) {
    failures.push(rel + ': found raw Loading... text');
  }

  for (const match of source.matchAll(/<button\b[^>]*>/g)) {
    if (!/data-testid=/.test(match[0])) {
      failures.push(rel + ': native button without data-testid near offset ' + match.index);
    }
  }

  for (const match of source.matchAll(/<a\b[^>]*>/g)) {
    const tag = match[0];
    if (!/data-testid=/.test(tag) && !/href="#/.test(tag)) {
      failures.push(rel + ': anchor without data-testid near offset ' + match.index);
    }
  }
}

const css = fs.readFileSync(path.resolve('frontend/src/index.css'), 'utf8');
for (const required of ['.skip-link', 'prefers-reduced-motion', 'focus-visible', 'env(safe-area-inset-bottom)']) {
  if (!css.includes(required)) failures.push('frontend/src/index.css: missing ' + required);
}

if (failures.length) {
  console.error('Phase 21 accessibility audit failed');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Phase 21 accessibility audit passed for ' + files.length + ' source files.');
