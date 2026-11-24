import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMembershipTarget } from './test-membership-concurrency.mjs';

test('membership races refuse remote Docker and source databases', () => {
  const isolated = { Config: { Labels: { 'barberos.restore-rehearsal': 'true' } }, HostConfig: { NetworkMode: 'none' } };
  assert.throws(() => validateMembershipTarget('barberos_restore_safe', 'tcp://remote:2375', isolated));
  assert.throws(() => validateMembershipTarget('supabase_db_alseiinjzwjdiwtvkdzy', 'unix:///var/run/docker.sock', isolated));
  assert.throws(() => validateMembershipTarget('barberos_restore_safe', 'unix:///var/run/docker.sock', { ...isolated, HostConfig: { NetworkMode: 'bridge' } }));
  assert.doesNotThrow(() => validateMembershipTarget('barberos_restore_safe', 'unix:///var/run/docker.sock', isolated));
});
test('a CI target requires the matching CLI ownership label', () => {
  assert.throws(() => validateMembershipTarget('supabase_db_barberos_ci_1_1', 'unix:///var/run/docker.sock', { Config: { Labels: {} } }));
  assert.doesNotThrow(() => validateMembershipTarget('supabase_db_barberos_ci_1_1', 'unix:///var/run/docker.sock', { Config: { Labels: { 'com.supabase.cli.project': 'barberos_ci_1_1' } } }));
});
