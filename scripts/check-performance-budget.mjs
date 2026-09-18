import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const dist = path.resolve(process.cwd(), 'dist');
const manifestCandidates = [
  path.join(dist, '.vite', 'manifest.json'),
  path.join(dist, 'manifest.json'),
];
const manifestPath = manifestCandidates.find((file) => fs.existsSync(file));
if (!manifestPath) throw new Error('PERF_MANIFEST_MISSING');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function compressed(file) {
  const data = fs.readFileSync(path.join(dist, file));
  return {
    raw: data.length,
    gzip: gzipSync(data, { level: 9 }).length,
    brotli: brotliCompressSync(data).length,
  };
}

function resolveManifestKey(source) {
  if (manifest[source]) return source;
  const found = Object.entries(manifest).find(([key, entry]) =>
    key === source ||
    entry.src === source ||
    entry.name === source
  );
  if (!found) throw new Error('PERF_MANIFEST_ENTRY_MISSING:' + source);
  return found[0];
}

function collect(source, visited = new Set()) {
  const key = resolveManifestKey(source);
  if (visited.has(key)) return [];
  const entry = manifest[key];
  visited.add(key);

  const files = [{ file: entry.file, ...compressed(entry.file) }];
  for (const css of entry.css || []) files.push({ file: css, ...compressed(css) });
  for (const imported of entry.imports || []) files.push(...collect(imported, visited));
  return files;
}

const files = new Map();
for (const item of [...collect('src/main.tsx'), ...collect('src/pages/PublicBarbershop.tsx')]) {
  files.set(item.file, item);
}

const assets = [...files.values()];
const js = assets.filter((item) => item.file.endsWith('.js'));
const css = assets.filter((item) => item.file.endsWith('.css'));

const totals = {
  publicInitialJsRaw: js.reduce((sum, item) => sum + item.raw, 0),
  publicInitialJsGzip: js.reduce((sum, item) => sum + item.gzip, 0),
  publicInitialJsBrotli: js.reduce((sum, item) => sum + item.brotli, 0),
  publicInitialCssRaw: css.reduce((sum, item) => sum + item.raw, 0),
  publicInitialCssGzip: css.reduce((sum, item) => sum + item.gzip, 0),
  publicInitialTotalGzip: assets.reduce((sum, item) => sum + item.gzip, 0),
};

const budget = {
  publicInitialJsGzip: Number(process.env.PERF_PUBLIC_JS_GZIP_MAX || 300000),
  publicInitialJsBrotli: Number(process.env.PERF_PUBLIC_JS_BROTLI_MAX || 250000),
  publicInitialCssGzip: Number(process.env.PERF_PUBLIC_CSS_GZIP_MAX || 80000),
  publicInitialTotalGzip: Number(process.env.PERF_PUBLIC_TOTAL_GZIP_MAX || 360000),
};

console.log(JSON.stringify({ manifest: manifestPath, totals, budget }, null, 2));

for (const [name, actual, limit] of [
  ['publicInitialJsGzip', totals.publicInitialJsGzip, budget.publicInitialJsGzip],
  ['publicInitialJsBrotli', totals.publicInitialJsBrotli, budget.publicInitialJsBrotli],
  ['publicInitialCssGzip', totals.publicInitialCssGzip, budget.publicInitialCssGzip],
  ['publicInitialTotalGzip', totals.publicInitialTotalGzip, budget.publicInitialTotalGzip],
]) {
  if (actual > limit) throw new Error('PERF_BUDGET_EXCEEDED:' + name + '=' + actual + '>' + limit);
}

console.log('PASS | Phase 25 asset performance budgets');
