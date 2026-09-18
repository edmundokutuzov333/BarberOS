import fs from 'node:fs';
import path from 'node:path';

const root = fs.existsSync(path.resolve('frontend/src'))
  ? path.resolve('frontend/src')
  : path.resolve('src');
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

  if (/(["'`])(?:Loading|Carregando)\.\.\.\1/i.test(source)) {
    failures.push(rel + ': found raw Loading... text');
  }

  for (const match of source.matchAll(/<button\b[^>]*>/g)) {
    if (!/\btype=/.test(match[0])) {
      failures.push(rel + ': native button without explicit type near offset ' + match.index);
    }
  }

  for (const match of source.matchAll(/<a\b[^>]*target=(["'])_blank\1[^>]*>/g)) {
    if (!/\brel=/.test(match[0])) {
      failures.push(rel + ': target="_blank" anchor without rel near offset ' + match.index);
    }
  }

  for (const match of source.matchAll(/<(?:button|a)\b[^>]*>\s*<(?:[^ >]+)\b[^>]*(?:\/>)?\s*<\/[^>]+>\s*<\/(?:button|a)>/g)) {
    if (!/aria-label=/.test(match[0]) && !/aria-labelledby=/.test(match[0])) {
      failures.push(rel + ': possible icon-only control without accessible name near offset ' + match.index);
    }
  }
}

const cssPath = fs.existsSync(path.resolve('frontend/src/index.css'))
  ? path.resolve('frontend/src/index.css')
  : path.resolve('src/index.css');
const css = fs.readFileSync(cssPath, 'utf8');
for (const required of ['.skip-link', 'prefers-reduced-motion', 'focus-visible', 'env(safe-area-inset-bottom)']) {
  if (!css.includes(required)) failures.push('frontend/src/index.css: missing ' + required);
}

if (failures.length) {
  console.error('Phase 21 accessibility audit failed');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Phase 21 accessibility audit passed for ' + files.length + ' source files.');
