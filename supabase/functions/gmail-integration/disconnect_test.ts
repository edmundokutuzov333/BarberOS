import { revokeGoogleGrant } from './disconnect.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('assertion failed'); }
const token = async () => 'controlled-test-token';
Deno.test('revocation is confirmed only by the provider HTTP 200 response', async () => {
  assert(await revokeGoogleGrant(token, () => Promise.resolve(new Response('', { status: 200 }))));
});
Deno.test('provider rejection is not silently treated as revocation', async () => {
  assert(!await revokeGoogleGrant(token, () => Promise.resolve(new Response('', { status: 400 }))));
});
Deno.test('provider outage still permits a truthful local disconnection result', async () => {
  assert(!await revokeGoogleGrant(token, () => Promise.resolve(new Response('', { status: 503 }))));
});
Deno.test('transport failure cannot become a false confirmed revocation', async () => {
  assert(!await revokeGoogleGrant(token, () => Promise.reject(new TypeError('network failure'))));
});
Deno.test('corrupt local ciphertext does not send a token or prevent local deletion', async () => {
  let called = false;
  assert(!await revokeGoogleGrant(() => Promise.reject(new Error('decryption failed')), () => { called = true; return Promise.resolve(new Response()); }));
  assert(!called);
});
Deno.test('revocation uses a bounded POST body, never a token-bearing URL', async () => {
  assert(await revokeGoogleGrant(token, (input, init) => {
    assert(input === 'https://oauth2.googleapis.com/revoke');
    assert(init?.method === 'POST');
    assert(init.body instanceof URLSearchParams && init.body.get('token') === 'controlled-test-token');
    assert(init.signal instanceof AbortSignal);
    return Promise.resolve(new Response('', { status: 200 }));
  }));
});
