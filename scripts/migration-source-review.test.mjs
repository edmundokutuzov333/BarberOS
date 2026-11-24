import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { validSourceReview } from './migration-source-review.mjs';

const sql = 'update public.barbershops set phone=\'fictional\';\n';
const review = { status: 'retired_unsafe_demo_seed', evidence: 'Reviewed as unsafe: writes fictional contacts into real tenants.', source_sha256: createHash('sha256').update(sql).digest('hex') };
test('a retirement is bound to the reviewed SQL bytes', () => {
  assert.equal(validSourceReview(review, sql), true);
  assert.equal(validSourceReview(review, sql + '-- a later edit\n'), false);
});
test('retirement without a valid source fingerprint cannot clear the history gate', () => {
  for (const value of [undefined, '', 'invalid', 42]) assert.equal(validSourceReview({ ...review, source_sha256: value }, sql), false);
});
test('older behavioral contract evidence remains compatible while incomplete reviews fail', () => {
  assert.equal(validSourceReview({ status: 'superseded_contract', evidence: 'Actual server contract compared with archived SQL.' }, sql), true);
  assert.equal(validSourceReview({ ...review, evidence: 'OK' }, sql), false);
  assert.equal(validSourceReview(review, undefined), false);
});
