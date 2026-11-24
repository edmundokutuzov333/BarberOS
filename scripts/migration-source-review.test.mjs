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
test('reviewing a forward plan validates both source and candidate bytes without certifying deployment', () => {
  const candidate = 'select 1;';
  const forward = { ...review, status: 'reviewed_pending_forward', forward_candidates: [{ path: 'supabase/reconciliation/application_contracts.sql', sha256: createHash('sha256').update(candidate).digest('hex') }] };
  assert.equal(validSourceReview(forward, sql, () => candidate), true);
  assert.equal(validSourceReview(forward, sql, () => candidate + '--changed'), false);
  assert.equal(validSourceReview(forward, sql), false);
  assert.equal(validSourceReview({ ...forward, forward_candidates: [] }, sql, () => candidate), false);
  assert.equal(validSourceReview({ ...forward, forward_candidates: [{ ...forward.forward_candidates[0], path: '../unreviewed.sql' }] }, sql, () => candidate), false);
});
