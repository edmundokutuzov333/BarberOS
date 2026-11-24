import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileReconciliationBundle } from './verify-reconciliation-bundle.mjs';

const content = 'select 1;\n';
const manifest = { version: 1, migration: 'supabase/migrations/20261124044009_reconcile_application_authorization.sql', components: [{ path: 'supabase/reconciliation/application_contracts.sql', sha256: createHash('sha256').update(content).digest('hex') }] };
test('a compiled migration includes the exact approved SQL and rejects changed bytes', () => {
  assert.ok(compileReconciliationBundle(manifest, () => content).endsWith(content + '\n'));
  assert.throws(() => compileReconciliationBundle(manifest, () => content + 'grant all on all tables in schema public to anon;'), /HASH_MISMATCH/);
});
test('unscoped source or destination paths cannot be compiled', () => {
  assert.throws(() => compileReconciliationBundle({ ...manifest, migration: '../outside.sql' }, () => content));
  assert.throws(() => compileReconciliationBundle({ ...manifest, components: [{ ...manifest.components[0], path: '../../outside.sql' }] }, () => content));
});
