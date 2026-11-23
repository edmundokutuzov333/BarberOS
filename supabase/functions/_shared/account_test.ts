import { accountAccessFailure } from './account.ts';
function assert(condition: unknown): asserts condition { if (!condition) throw new Error('assertion failed'); }
Deno.test('a confirmed active profile may proceed', () => {
  assert(accountAccessFailure({ password_change_required: false }) === null);
});
Deno.test('a required rotation blocks operational account actions', () => {
  const result=accountAccessFailure({ password_change_required: true });
  assert(result?.code === 'PASSWORD_CHANGE_REQUIRED' && result.status === 403);
});
Deno.test('platform administrator status cannot override required rotation', () => {
  assert(accountAccessFailure({ password_change_required: true, is_platform_admin: true })?.status === 403);
});
Deno.test('the explicit own-password completion exception remains reachable', () => {
  assert(accountAccessFailure({ password_change_required: true },{ allowRequiredPasswordChange: true }) === null);
});
Deno.test('missing or malformed authoritative state fails closed', () => {
  for(const value of [null, undefined, {}, [], true, 'false', {password_change_required:'false'},{password_change_required:0}]) {
    assert(accountAccessFailure(value)?.code === 'ACCOUNT_STATE_UNAVAILABLE');
  }
});
Deno.test('a database error never reuses a permissive stale profile', () => {
  assert(accountAccessFailure({ password_change_required: false },{ databaseError: true })?.status === 503);
});
Deno.test('the completion exception cannot override missing authoritative state', () => {
  assert(accountAccessFailure(null,{ allowRequiredPasswordChange: true })?.status === 503);
});
Deno.test('untrusted user metadata does not override the database flag', () => {
  assert(accountAccessFailure({ password_change_required: true, user_metadata:{password_change_required:false,is_platform_admin:true} })?.status === 403);
});
