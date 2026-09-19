import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const names = fs.readdirSync(migrationDir).filter((n) => n.endsWith('.sql')).sort();

if (!names.length) throw new Error('SUPABASE_MIGRATION_DIRECTORY_EMPTY');

let previous = '';
for (const name of names) {
  const version = name.split('_', 1)[0];
  if (!/^\d{14}$/.test(version)) throw new Error('SUPABASE_MIGRATION_TIMESTAMP_INVALID:' + name);
  if (version <= previous) throw new Error('SUPABASE_MIGRATION_ORDER_INVALID:' + name);
  previous = version;
  const content = fs.readFileSync(path.join(migrationDir, name), 'utf8');
  if (/\bCOMMIT\s*;/i.test(content) || /\bROLLBACK\s*;/i.test(content)) {
    throw new Error('SUPABASE_MIGRATION_TRANSACTION_CONTROL_FORBIDDEN:' + name);
  }
}

const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
if (!config.includes('project_id = "alseiinjzwjdiwtvkdzy"')) throw new Error('SUPABASE_PROJECT_REF_MISMATCH');

console.log(JSON.stringify({
  migrations: names.length,
  latest: names.at(-1),
  project_ref: 'alseiinjzwjdiwtvkdzy',
}, null, 2));
console.log('PASS | Phase 26 Supabase release contract');
