import { test, expect } from '@playwright/test';

const endpoint = process.env.BARBEROS_E2E_CONCURRENCY_URL;

test.describe('BarberOS Phase 24 booking concurrency', () => {
  test('two clients competing for one slot yield exactly one 200 and one 409 SLOT_TAKEN', async ({ request }) => {
    test.skip(
      !endpoint ||
      !process.env.BARBEROS_E2E_CONCURRENCY_SLUG ||
      !process.env.BARBEROS_E2E_CONCURRENCY_SERVICE_ID ||
      !process.env.BARBEROS_E2E_CONCURRENCY_BARBER_ID ||
      !process.env.BARBEROS_E2E_CONCURRENCY_START,
      'Dedicated concurrency environment is required.',
    );

    if (/alseiinjzwjdiwtvkdzy\.supabase\.co/i.test(endpoint)) {
      throw new Error('Refusing to run mutating concurrency test against production Supabase.');
    }

    const common = {
      p_slug: process.env.BARBEROS_E2E_CONCURRENCY_SLUG,
      p_service_id: process.env.BARBEROS_E2E_CONCURRENCY_SERVICE_ID,
      p_haircut_id: null,
      p_barber_id: process.env.BARBEROS_E2E_CONCURRENCY_BARBER_ID,
      p_start: process.env.BARBEROS_E2E_CONCURRENCY_START,
    };

    const [responseA, responseB] = await Promise.all([
      request.post(endpoint, {
        data: {
          ...common,
          p_name: 'Phase 24 A',
          p_phone: '+25884' + Date.now().toString().slice(-7),
          p_email: null,
        },
      }),
      request.post(endpoint, {
        data: {
          ...common,
          p_name: 'Phase 24 B',
          p_phone: '+25885' + Date.now().toString().slice(-7),
          p_email: null,
        },
      }),
    ]);

    const statuses = [responseA.status(), responseB.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const losingResponse = responseA.status() === 409 ? responseA : responseB;
    const losingBody = await losingResponse.json();
    expect(losingBody.ok).toBe(false);
    expect(losingBody.error).toBe('SLOT_TAKEN');

    const winningResponse = responseA.status() === 200 ? responseA : responseB;
    const winningBody = await winningResponse.json();
    expect(winningBody.ok).toBe(true);
    expect(winningBody.booking?.manage_token).toBeTruthy();
    expect('appointment_id' in (winningBody.booking ?? {})).toBe(false);
  });
});
