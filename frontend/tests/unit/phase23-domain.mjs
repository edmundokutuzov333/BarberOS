import { strict as assert } from 'node:assert';
import { createServer } from 'vite';

async function main() {
  const server = await createServer({ root: process.cwd(), logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true } });
  try {
    const utils = await server.ssrLoadModule('/src/lib/utils.ts');
    const calendar = await server.ssrLoadModule('/src/lib/calendar.ts');
    const permissions = await server.ssrLoadModule('/src/lib/permissions.ts');
    const offers = await server.ssrLoadModule('/src/features/booking/offer.ts');
    const tests = [
      ['booking offer resolves linked variants only, preserving zero price and inheritance', () => {
        const base = { id: 'service', price_cents: 25000, duration_min: 30 };
        const variant = { id: 'style', service_id: 'service', price_cents: 45000, duration_min: 60 };
        assert.equal(offers.styleMatchesService(variant, 'service'), true);
        assert.equal(offers.styleMatchesService({ ...variant, service_id: null }, 'service'), false);
        assert.equal(offers.styleMatchesService(variant, 'other'), false);
        assert.deepEqual(offers.effectiveOffer(base, variant), { ...base, price_cents: 45000, duration_min: 60 });
        assert.deepEqual(offers.effectiveOffer(base, { ...variant, price_cents: 0, duration_min: null }), { ...base, price_cents: 0 });
        assert.deepEqual(offers.effectiveOffer(base, { ...variant, service_id: null }), base);
        assert.equal(offers.styleMatchesService({ ...variant, duration_min: 2 }, 'service'), false);
        const secondary = { ...variant, additional_offers: [{ service_id: 'other', price_cents: 65000, duration_min: null }], skill_restricted: true, skill_barber_ids: ['trained'] };
        assert.equal(offers.styleMatchesService(secondary, 'other'), true);
        assert.deepEqual(offers.effectiveOffer({ ...base, id: 'other' }, secondary), { ...base, id: 'other', price_cents: 65000 });
        assert.equal(offers.barberCanStyle('trained', secondary), true);
        assert.equal(offers.barberCanStyle('other', secondary), false);
        assert.equal(offers.barberCanStyle('trained', { ...secondary, skill_barber_ids: [] }), false);
        assert.equal(offers.groupServices([{ ...base, category: 'Cabelo', subcategory: 'Corte' }, { ...base, id: 'other', category: 'Barba' }]).length, 2);
        assert.equal(offers.bookingPath('shop', 'service', 'style'), '/barbearia/shop/marcar?service=service&step=3&haircut=style');
      }],
      ['formatMT formats Metical cents', () => {
        assert.equal(utils.formatMT(0), '0 MT');
        assert.equal(utils.formatMT(500), '5 MT');
        assert.equal(utils.formatMT(123456), '1 234,56 MT');
        assert.equal(utils.formatMT(-123456), '-1 234,56 MT');
      }],
      ['slugify creates public-safe slugs', () => {
        assert.equal(utils.slugify('Barbearia Central MÁCIA!'), 'barbearia-central-macia');
        assert.equal(utils.slugify('  Café  &  Corte  '), 'cafe-corte');
      }],
      ['humanError preserves business contracts', () => {
        assert.equal(utils.humanError({ message: 'SLOT_TAKEN' }), 'Este horário acabou de ser ocupado. Escolha outro horário.');
        assert.equal(utils.humanError({ message: 'INVALID_PHONE from booking' }), 'Número inválido. Usa o formato 84 000 0000.');
        assert.equal(utils.humanError({ message: 'unknown backend failure' }), 'Algo falhou. Tenta de novo.');
      }],
      ['calendar output is escaped and structurally valid', () => {
        const appointment = {
          shop_name: 'Barbearia, Central', shop_slug: 'central', shop_address: 'Av. Julius Nyerere; Maputo',
          service_name: 'Corte; Premium', haircut_name: 'Low, Fade', barber_name: 'Nelson',
          appointment_starts_at: '2026-10-10T08:00:00.000Z', appointment_ends_at: '2026-10-10T08:40:00.000Z',
        };
        const ics = calendar.buildAppointmentCalendar(appointment, 'https://example.test/marcacao/token');
        assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
        assert.match(ics, /UID:barberos-central-/);
        assert.match(ics, /SUMMARY:Corte\\; Premium · Barbearia\\, Central/);
        assert.match(ics, /LOCATION:Av\. Julius Nyerere\\; Maputo/);
        assert.match(ics, /END:VCALENDAR$/);
      }],
      ['WhatsApp link normalizes Mozambique numbers', () => {
        assert.match(calendar.buildWhatsAppLink('84 123 4567', 'Olá'), /^https:\/\/wa\.me\/258841234567\?text=/);
        assert.match(calendar.buildWhatsAppLink('+258841234567', 'Olá'), /^https:\/\/wa\.me\/258841234567\?text=/);
        assert.match(calendar.buildWhatsAppLink('258841234567', 'Olá'), /^https:\/\/wa\.me\/258841234567\?text=/);
      }],
      ['permission matrix isolates roles', () => {
        assert.equal(permissions.canAccessAppRoute('owner', '/app/definicoes/pagamentos'), true);
        assert.equal(permissions.canAccessAppRoute('manager', '/app/definicoes/pagamentos'), false);
        assert.equal(permissions.canAccessAppRoute('barber', '/app/definicoes/pagamentos'), false);
        assert.equal(permissions.canAccessAppRoute('manager', '/app/agenda'), true);
        assert.equal(permissions.canAccessAppRoute('barber', '/app/agenda'), true);
        assert.equal(permissions.canAccessAppRoute(null, '/app/agenda'), false);
        assert.equal(permissions.canManageTeam('owner'), true);
        assert.equal(permissions.canManageTeam('manager'), false);
      }],
    ];

    let failed = 0;
    for (const [name, run] of tests) {
      try { await run(); console.log('PASS', name); }
      catch (error) { failed++; console.error('FAIL', name, error); }
    }
    console.log('Phase 23 unit tests: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
    if (failed) process.exitCode = 1;
  } finally {
    await server.close();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
