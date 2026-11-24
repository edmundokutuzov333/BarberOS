import { createOrUpdateEvent, exchangeCode, type CalendarEvent } from './provider.ts';
import { CalendarError } from './errors.ts';
function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const settings = { clientId: 'fixture-client', clientSecret: 'fixture-secret', redirectUri: 'https://fixture.supabase.co/functions/v1/google-calendar' };
const event: CalendarEvent = {
  id: 'b' + 'a'.repeat(64), summary: 'QA booking', description: 'Controlled booking',
  start: { dateTime: '2026-12-01T10:00:00+02:00', timeZone: 'Africa/Maputo' },
  end: { dateTime: '2026-12-01T10:30:00+02:00', timeZone: 'Africa/Maputo' },
  reminders: { useDefault: true }, visibility: 'private', source: { title: 'BarberOS', url: 'https://example.invalid/booking' },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stored = () => json({ id: event.id, status: 'confirmed' });
async function rejects(run: () => Promise<unknown>) {
  let failed = false;
  try { await run(); } catch (error) {
    assert(error instanceof CalendarError);assert(error.code === 'GOOGLE_CALENDAR_PROVIDER_FAILED');
    assert(error.status === 502);assert(!error.message.includes(settings.clientSecret));failed = true;
  }
  assert(failed, 'expected a sanitized provider failure');
}
Deno.test('OAuth exchange keeps credentials in a bounded POST and blocks redirects', async () => {
  const token = await exchangeCode('fixture-code', settings, { fetcher: (url, init) => {
    assert(url === 'https://oauth2.googleapis.com/token');assert(init?.method === 'POST');assert(init.redirect === 'error');
    assert(init.signal instanceof AbortSignal);assert(init.body instanceof URLSearchParams);
    assert(init.body.get('client_secret') === settings.clientSecret);assert(init.body.get('code') === 'fixture-code');
    assert(init.body.get('redirect_uri') === settings.redirectUri);return Promise.resolve(json({ access_token: 'fixture-access' }));
  } });assert(token === 'fixture-access');
});
for (const [name, body, status] of [
  ['missing token', {}, 200], ['empty token', { access_token: '' }, 200],
  ['blank token', { access_token: '  ' }, 200], ['provider denial', { access_token: 'ignored' }, 400],
] as const) Deno.test('OAuth rejects ' + name, () => rejects(() => exchangeCode('code', settings, { fetcher: () => Promise.resolve(json(body, status)) })));
Deno.test('OAuth rejects malformed JSON without exposing the provider response', () => rejects(() => exchangeCode('code', settings, { fetcher: () => Promise.resolve(new Response('private provider failure')) })));
Deno.test('network failures become a stable domain error', () => rejects(() => exchangeCode('code', settings, { fetcher: () => Promise.reject(new Error('private network details')) })));
const hung: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
  assert(init?.signal instanceof AbortSignal);
  init.signal.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
});
Deno.test('a stalled OAuth request actually aborts at its deadline', () => rejects(() => exchangeCode('code', settings, { fetcher: hung, timeoutMs: 5 })));
Deno.test('event insertion validates the stored identity and never invites attendees', async () => {
  let calls = 0;
  const result = await createOrUpdateEvent('fixture-access', event, { fetcher: (url, init) => {
    calls++;assert(String(url).endsWith('/primary/events?sendUpdates=none'));assert(init?.method === 'POST');
    assert(init.redirect === 'error');assert(init.signal instanceof AbortSignal);
    const body = JSON.parse(String(init.body));assert(body.id === event.id);assert(!('attendees' in body));
    assert(body.visibility === 'private');return Promise.resolve(stored());
  } });assert(result === 'added');assert(calls === 1);
});
Deno.test('a duplicate inserts then patches exactly the same event without changing its identity', async () => {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  const result = await createOrUpdateEvent('fixture-access', event, { fetcher: (url, init) => {
    calls.push({ url: String(url), method: String(init?.method), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(calls.length === 1 ? json({ error: 'exists' }, 409) : stored());
  } });
  assert(result === 'updated');assert(calls.length === 2);assert(calls[0].body.id === event.id);
  assert(calls[1].url.endsWith('/events/' + event.id + '?sendUpdates=none'));
  assert(calls[1].method === 'PATCH');assert(!('id' in calls[1].body));assert(event.id === 'b' + 'a'.repeat(64));
});
for (const status of [401, 429, 500]) Deno.test('provider HTTP ' + status + ' never triggers a second write', async () => {
  let calls = 0;
  await rejects(() => createOrUpdateEvent('access', event, { fetcher: () => { calls++;return Promise.resolve(json({ error: 'private' }, status)); } }));
  assert(calls === 1);
});
for (const body of [{}, { id: 'wrong', status: 'confirmed' }, { id: event.id, status: 'cancelled' }]) {
  Deno.test('HTTP success with an invalid event response cannot become a false added receipt: ' + JSON.stringify(body),
    () => rejects(() => createOrUpdateEvent('access', event, { fetcher: () => Promise.resolve(json(body)) })));
}
Deno.test('a duplicate followed by a failed patch stays a provider failure', async () => {
  let calls = 0;
  await rejects(() => createOrUpdateEvent('access', event, { fetcher: () => Promise.resolve(json({}, ++calls === 1 ? 409 : 503)) }));
  assert(calls === 2);
});
Deno.test('a stalled event insertion aborts without a hidden retry', async () => {
  let calls = 0;
  await rejects(() => createOrUpdateEvent('access', event, { fetcher: (url, init) => { calls++;return hung(url, init); }, timeoutMs: 5 }));
  assert(calls === 1);
});
Deno.test('invalid event identity is rejected before transport', async () => {
  let calls = 0;
  await rejects(() => createOrUpdateEvent('access', { ...event, id: '../other-event' }, { fetcher: () => { calls++;return Promise.resolve(stored()); } }));
  assert(calls === 0);
});

const hungBody: typeof fetch = (_url, init) => {
  assert(init?.signal instanceof AbortSignal);
  const signal = init.signal;
  const body = new ReadableStream({ start(controller) {
    signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
  } });
  return Promise.resolve(new Response(body));
};
Deno.test('OAuth response body stalls remain covered by the deadline', () => rejects(() => exchangeCode('code', settings, { fetcher: hungBody, timeoutMs: 5 })));
Deno.test('event acknowledgement body stalls cannot claim success', () => rejects(() => createOrUpdateEvent('access', event, { fetcher: hungBody, timeoutMs: 5 })));
Deno.test('a stalled duplicate update aborts after exactly two requests', async () => {
  let calls = 0;
  await rejects(() => createOrUpdateEvent('access', event, { fetcher: (url, init) => {
    calls++;return calls === 1 ? Promise.resolve(json({}, 409)) : hung(url, init);
  }, timeoutMs: 5 }));
  assert(calls === 2);
});
