import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('already mapped migrations newer than the baseline are not reported as unreviewed',()=>{
  const script=fileURLToPath(new URL('./audit-supabase-migration-history.mjs',import.meta.url));
  const report=JSON.parse(execFileSync(process.execPath,[script,'--report-only'],{encoding:'utf8'}));
  const staging=report.projects.find(project=>project.environment==='staging');
  assert.ok(staging);
  for(const file of ['20261026200000_shop_partial_delivery_notification.sql',
    '20261026210000_shop_operation_incidents_phase8.sql',
    '20261026220000_shop_incident_foreign_key_indexes_phase8.sql']) {
    assert.ok(staging.new_local_migration_files_since_snapshot.includes(file));
    assert.ok(!staging.unreviewed_new_local_files_not_after_remote_head.includes(file),file);
  }
  assert.equal(report.status,'NO_GO_UNRESOLVED_HISTORY_MAPPING');
  assert.ok(report.unresolved_source_file_total>0,'Real unapplied sources must keep release blocked');
});
