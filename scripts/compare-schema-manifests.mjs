import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const categories = ['tables','columns','constraints','indexes','functions','policies','triggers','views','enums','grants','extensions'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
}
function identity(category, row) {
  const fields = category === 'grants' ? ['schema','table','role','privilege']
    : category === 'enums' ? ['schema','name','label']
    : category === 'functions' ? ['schema','name','arguments'] : ['schema','table','name'];
  return fields.map(key => row[key] ?? '').join('|');
}
export function compareSchemaManifests(expected, actual) {
  const differences = {};
  for (const category of categories) {
    if (!Array.isArray(expected?.[category]) || !Array.isArray(actual?.[category])) throw new Error('SCHEMA_MANIFEST_INVALID:' + category);
    const index = rows => {
      const entries = new Map();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('SCHEMA_ROW_INVALID:' + category);
        const key = identity(category,row);
        if (entries.has(key)) throw new Error('SCHEMA_IDENTITY_DUPLICATE:' + category + ':' + key);
        entries.set(key,row);
      }
      return entries;
    };
    const left = index(expected[category]), right = index(actual[category]);
    const missing = [...left.keys()].filter(key => !right.has(key));
    const extra = [...right.keys()].filter(key => !left.has(key));
    const changed = [...left.keys()].filter(key => right.has(key) && JSON.stringify(canonical(left.get(key))) !== JSON.stringify(canonical(right.get(key))));
    if (missing.length || extra.length || changed.length) differences[category] = {missing,extra,changed};
  }
  return {status:Object.keys(differences).length ? 'SCHEMA_DRIFT' : 'SCHEMA_MATCH',differences};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [expectedPath,actualPath] = process.argv.slice(2).filter(arg => arg !== '--report-only');
  if (!expectedPath || !actualPath) throw new Error('Usage: node scripts/compare-schema-manifests.mjs expected.json actual.json [--report-only]');
  const result = compareSchemaManifests(JSON.parse(fs.readFileSync(expectedPath,'utf8')),JSON.parse(fs.readFileSync(actualPath,'utf8')));
  console.log(JSON.stringify(result,null,2));
  if (result.status !== 'SCHEMA_MATCH' && !process.argv.includes('--report-only')) process.exitCode = 1;
}
