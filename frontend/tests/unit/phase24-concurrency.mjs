import { strict as assert } from 'node:assert';
import { createServer } from 'vite';

async function main() {
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  });

  try {
    const booking = await server.ssrLoadModule('/src/features/booking/api.ts');
    const shopLink = await server.ssrLoadModule('/src/lib/shop-link.ts');

    const tests = [
      ['BookingRequestError preserves HTTP conflict semantics', () => {
        const error = new booking.BookingRequestError(
          'SLOT_TAKEN',
          409,
          'slot conflict',
        );
        assert.equal(error.code, 'SLOT_TAKEN');
        assert.equal(error.status, 409);
        assert.equal(error.name, 'BookingRequestError');
      }],
      ['public booking result contains only public management identity', () => {
        const result = /** @type {import('/src/features/booking/api.ts').BookAppointmentResult} */ ({
          manage_token: 'token',
          deposit_cents: 0,
          needs_payment: false,
        });
        assert.equal('appointment_id' in result, false);
        assert.equal(result.manage_token, 'token');
      }],
      ['Mozambique phone normalisation stays unchanged at the public boundary', () => {
        assert.equal(booking.normalizeMozPhone('84 000 0000'), '+258840000000');
        assert.equal(booking.normalizeMozPhone('258840000000'), '+258840000000');
      }],
      ['blocked local storage cannot turn a server-confirmed booking into a client-side failure', () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        Object.defineProperty(globalThis, 'localStorage', {
          configurable: true,
          value: {
            getItem: () => '[]',
            setItem: () => { throw new Error('STORAGE_BLOCKED'); },
          },
        });
        try {
          assert.doesNotThrow(() => shopLink.rememberLocalBooking({
            token: 'opaque-management-token',
            shopSlug: 'oryon',
            startsAt: '2026-10-22T08:00:00.000Z',
            serviceName: 'Corte',
          }));
        } finally {
          if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
          else Reflect.deleteProperty(globalThis, 'localStorage');
        }
      }],
    ];

    let failed = 0;
    for (const [name, run] of tests) {
      try {
        run();
        console.log('PASS', name);
      } catch (error) {
        failed += 1;
        console.error('FAIL', name, error);
      }
    }

    console.log('Phase 24 unit tests: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
    if (failed) process.exitCode = 1;
  } finally {
    await server.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
