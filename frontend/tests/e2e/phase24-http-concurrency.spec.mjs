import { test, expect } from '@playwright/test';

const endpoint = process.env.BARBEROS_E2E_CONCURRENCY_URL;
const gatewayEndpoint = endpoint?.replace(/\/booking-create$/, '/token-gateway');
const headers = {
  apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  authorization: 'Bearer ' + process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

test.describe('BarberOS Phase 24 booking concurrency', () => {
  test('two clients competing for one slot yield exactly one 200 and one 409 SLOT_TAKEN', async ({ request }) => {
    test.skip(
      !endpoint ||
      !process.env.BARBEROS_E2E_CONCURRENCY_SLUG ||
      !process.env.BARBEROS_E2E_CONCURRENCY_SERVICE_ID ||
      !process.env.BARBEROS_E2E_CONCURRENCY_BARBER_ID ||
      !process.env.BARBEROS_E2E_CONCURRENCY_START,
      'Dedicated staging concurrency environment is required.',
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
      p_shop_items: [],
      p_email: null,
    };
    const requestA = {
      ...common,
      p_name: 'Phase 24 A',
      p_phone: '+25884' + Date.now().toString().slice(-7),
      idempotency_key: crypto.randomUUID(),
    };
    const requestB = {
      ...common,
      p_name: 'Phase 24 B',
      p_phone: '+25885' + (Date.now() + 1).toString().slice(-7),
      idempotency_key: crypto.randomUUID(),
    };

    let manageToken = null;
    let testFailure = null;
    try {
      const [responseA, responseB] = await Promise.all([
        request.post(endpoint, { headers, data: requestA }),
        request.post(endpoint, { headers, data: requestB }),
      ]);

      const [textA, textB] = await Promise.all([responseA.text(), responseB.text()]);
      const parseBody = (text) => { try { return JSON.parse(text); } catch { return { raw: text }; } };
      const bodyA = parseBody(textA);
      const bodyB = parseBody(textB);
      const statuses = [responseA.status(), responseB.status()].sort((a, b) => a - b);
      expect(statuses, JSON.stringify({ statusA: responseA.status(), bodyA, statusB: responseB.status(), bodyB })).toEqual([200, 409]);

      const losingResponse = responseA.status() === 409 ? responseA : responseB;
      const losingBody = responseA.status() === 409 ? bodyA : bodyB;
      expect(losingBody.ok).toBe(false);
      expect(losingBody.error).toBe('SLOT_TAKEN');

      const winningResponse = responseA.status() === 200 ? responseA : responseB;
      const winningBody = responseA.status() === 200 ? bodyA : bodyB;
      expect(winningBody.ok).toBe(true);
      expect(winningBody.booking?.manage_token).toBeTruthy();
      expect('appointment_id' in (winningBody.booking ?? {})).toBe(false);
      manageToken = winningBody.booking.manage_token;

      const winningRequest = responseA.status() === 200 ? requestA : requestB;
      const retryResponse = await request.post(endpoint, { headers, data: winningRequest });
      expect(retryResponse.status()).toBe(200);
      const retryBody = await retryResponse.json();
      expect(retryBody.booking?.manage_token).toBe(manageToken);
    } catch (error) {
      testFailure = error;
    } finally {
      if (manageToken && gatewayEndpoint && process.env.BARBEROS_E2E_CONCURRENCY_SKIP_CLEANUP !== '1') {
        const cleanup = await request.post(gatewayEndpoint, {
          headers,
          data: {
            action: 'appointment.cancel',
            token: manageToken,
            reason: 'Automated Phase 24 concurrency test cleanup',
          },
        });
        if (cleanup.status() !== 200) {
          const body = await cleanup.text();
          throw new Error('STAGING_CONCURRENCY_CLEANUP_FAILED:' + cleanup.status() + ':' + body);
        }
      }
    }
    if (testFailure) throw testFailure;
  });
});
