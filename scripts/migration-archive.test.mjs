import assert from 'node:assert/strict';
import test from 'node:test';
import { isMigrationArchive } from './migration-archive.mjs';

test('archive resolution requires a named SQL file in the matching environment', () => {
  const source = 'docs/remote-migration-archive/production/20260918153729_manual_booking_phone_structural.sql';
  assert.equal(isMigrationArchive('/repo', 'production', source, () => true), true);
  assert.equal(isMigrationArchive('/repo', 'staging', source, () => true), false);
  assert.equal(isMigrationArchive('/repo', 'production', source, () => false), false);
});

test('malformed and escaping archive paths cannot validate a review', () => {
  for (const source of [null, {}, '/tmp/known.sql', '../known.sql',
    'docs/remote-migration-archive/production/../staging/20260918153729_patch.sql',
    'docs/remote-migration-archive/production/20260918153729_patch.sql/child',
    'docs/remote-migration-archive/production/20260918153729_patch.js']) {
    assert.equal(isMigrationArchive('/repo', 'production', source, () => true), false);
  }
  assert.equal(isMigrationArchive('/repo', '../production', 'anything', () => true), false);
});
