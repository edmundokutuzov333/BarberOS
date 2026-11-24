import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function compileReconciliationBundle(manifest, readComponent) {
  if (manifest?.version !== 1 || !/^supabase\/migrations\/\d{14}_reconcile_application_authorization\.sql$/.test(manifest.migration ?? '')
    || !Array.isArray(manifest.components) || !manifest.components.length) throw new Error('RECONCILIATION_MANIFEST_INVALID');
  let result = '-- Reviewed application authorization reconciliation.\n-- Generated from fingerprinted components; preserve published migration history.\n';
  for (const component of manifest.components) {
    if (!/^supabase\/reconciliation\/[a-z_]+\.sql$/.test(component.path ?? '') || !/^[0-9a-f]{64}$/.test(component.sha256 ?? '')) throw new Error('RECONCILIATION_COMPONENT_INVALID');
    const content = readComponent(component.path);
    if (createHash('sha256').update(content).digest('hex') !== component.sha256) throw new Error('RECONCILIATION_COMPONENT_HASH_MISMATCH');
    result += '\n-- Reviewed component: ' + component.path + '\n' + content + '\n';
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase/reconciliation/bundle.json'), 'utf8'));
  const expected = compileReconciliationBundle(manifest, relative => fs.readFileSync(path.join(root, relative), 'utf8'));
  const actual = fs.readFileSync(path.join(root, manifest.migration), 'utf8');
  if (actual !== expected || createHash('sha256').update(actual).digest('hex') !== manifest.migration_sha256) throw new Error('RECONCILIATION_MIGRATION_DIFFERS_FROM_REVIEWED_COMPONENTS');
  console.log('PASS | versioned reconciliation matches all reviewed SQL components');
}
