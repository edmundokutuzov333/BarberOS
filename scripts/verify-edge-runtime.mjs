// Read-only deployment certification. No customer, payment or auth mutations.
const base = process.env.BARBEROS_SUPABASE_URL;
const origin = process.env.BARBEROS_PUBLIC_URL;
if (!base || !origin) throw new Error('BARBEROS_SUPABASE_URL and BARBEROS_PUBLIC_URL are required');
const endpoint = new URL('/functions/v1/', base);
const browserFunctions = [
  'booking-create', 'token-gateway', 'gmail-integration', 'google-calendar',
  'admin-credential-manager', 'payments-configure', 'payments-initiate', 'payments-status',
];
let failures = 0;
async function check(name, callback) {
  try { await callback(); console.log('PASS | ' + name); }
  catch (error) { failures++; console.error('FAIL | ' + name + ' | ' + error.message); }
}
async function request(name, init = {}) {
  return fetch(new URL(name, endpoint), { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
}
await check('health database roundtrip', async () => {
  const response = await request('health');
  if (response.status !== 200) throw new Error('HTTP_' + response.status);
  const body = await response.json();
  if (body.ok !== true || !Number.isFinite(body.db_ms) || !body.version || body.version === 'unknown') {
    throw new Error('INVALID_HEALTH_CONTRACT');
  }
});
for (const fn of browserFunctions) {
  for (const allowed of [true, false]) {
    await check(fn + (allowed ? ' browser preflight' : ' untrusted origin isolation'), async () => {
      const response = await request(fn, { method: 'OPTIONS', headers: {
        Origin: allowed ? origin : 'https://untrusted.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-info',
      } });
      if (![200, 204].includes(response.status)) throw new Error('HTTP_' + response.status);
      const cors = response.headers.get('access-control-allow-origin');
      if (allowed ? cors !== origin : cors !== null) throw new Error('INVALID_CORS_ORIGIN');
      if (!response.headers.get('vary')?.toLowerCase().includes('origin')) throw new Error('VARY_ORIGIN_MISSING');
      if (allowed) {
        const headers = response.headers.get('access-control-allow-headers')?.toLowerCase().split(',').map(s => s.trim()) ?? [];
        for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info']) {
          if (!headers.includes(header)) throw new Error('CORS_HEADER_MISSING_' + header);
        }
      }
    });
  }
}
// A deployed webhook must reject an unsigned request before processing its body.
await check('resend signed webhook boundary', async () => {
  const response = await request('resend-webhook', { method: 'GET' });
  if (response.status !== 405) throw new Error('HTTP_' + response.status);
});
if (failures) process.exitCode = 1;
