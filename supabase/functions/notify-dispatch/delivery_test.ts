import { deliverNotification, retryableDeliveryError, type DeliveryDependencies } from './delivery.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

type Job = { id: string };
function fixture() {
  const calls: string[] = [];
  const failures: Array<{ retryable: boolean; message: string; fallbackUrl: string | null }> = [];
  const dependencies: DeliveryDependencies<Job> = {
    prepare: () => ({ message: 'controlled message', fallbackUrl: 'https://example.invalid/manual' }),
    send: async (job, message) => {
      assert(job.id === 'notification-123' && message === 'controlled message');
      calls.push('send');
      return { provider: 'email', providerMessageId: 'provider-123' };
    },
    markSent: async (_, delivery) => { assert(delivery.providerMessageId === 'provider-123'); calls.push('persist-sent'); },
    markFailure: async (_, failure) => {
      calls.push('persist-failure'); failures.push(failure);
      return failure.retryable ? 'queued' : 'failed';
    },
  };
  return { calls, failures, dependencies, job: { id: 'notification-123' } };
}

Deno.test('success is reported only after delivery and durable persistence', async () => {
  const f = fixture();
  const result = await deliverNotification(f.job, f.dependencies);
  assert(f.calls.join(',') === 'send,persist-sent');
  assert(result.status === 'sent' && result.provider === 'email' && f.failures.length === 0);
});

Deno.test('unsupported rendering is permanently failed instead of left processing', async () => {
  const f = fixture();
  f.dependencies.prepare = () => { throw new Error('NOTIFICATION_TEMPLATE_UNSUPPORTED:invalid'); };
  const result = await deliverNotification(f.job, f.dependencies);
  assert(f.calls.join(',') === 'persist-failure');
  assert(result.status === 'failed' && !f.failures[0].retryable && f.failures[0].fallbackUrl === null);
});

Deno.test('rate limits retain a retryable durable job and manual fallback', async () => {
  const f = fixture();
  f.dependencies.send = async () => { throw Object.assign(new Error('EMAIL_429'), { status: 429 }); };
  const result = await deliverNotification(f.job, f.dependencies);
  assert(result.status === 'retrying' && f.failures[0].retryable);
  assert(f.failures[0].fallbackUrl === 'https://example.invalid/manual');
  assert(!f.calls.includes('persist-sent'));
});

Deno.test('credential and validation failures do not retry; temporary failures do', () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert(!retryableDeliveryError(Object.assign(new Error('provider rejected'), { status })), 'status ' + status);
  }
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert(retryableDeliveryError(Object.assign(new Error('provider unavailable'), { status })), 'status ' + status);
  }
  assert(retryableDeliveryError(new TypeError('network failed')));
  assert(!retryableDeliveryError(new Error('EMAIL_PROVIDER_NOT_CONFIGURED')));
  assert(!retryableDeliveryError(new Error('RECIPIENT_INVALID')));
  assert(!retryableDeliveryError(new RangeError('Invalid time zone')));
});

Deno.test('a post-send database failure cannot report a successful persisted delivery', async () => {
  const f = fixture();
  f.dependencies.markSent = async () => { throw new Error('RPC_mark_notification_sent:unavailable'); };
  const result = await deliverNotification(f.job, f.dependencies);
  assert(result.status === 'retrying');
  assert(f.calls.join(',') === 'send,persist-failure' && f.failures[0].retryable);
});

Deno.test('failure-state persistence errors propagate instead of fabricating a final state', async () => {
  const f = fixture();
  f.dependencies.prepare = () => { throw new Error('NOTIFICATION_TEMPLATE_UNSUPPORTED:invalid'); };
  f.dependencies.markFailure = async () => { throw new Error('failure persistence unavailable'); };
  let rejected = false;
  try { await deliverNotification(f.job, f.dependencies); }
  catch (error) { rejected = error instanceof Error && error.message === 'failure persistence unavailable'; }
  assert(rejected);
});
