import { strict as assert } from 'node:assert';
import { createServer, type ViteDevServer } from 'vite';

type TestCase = { name: string; run: () => void | Promise<void> };

async function main() {
  const server: ViteDevServer = await createServer({ root: 'frontend', logLevel: 'error', server: { middlewareMode: true } });
  try {
    const utils = await server.ssrLoadModule('/src/lib/utils.ts');
    const calendar = await server.ssrLoadModule('/src/lib/calendar.ts');
    const permissions = await server.ssrLoadModule('/src/lib/permissions.ts');
    const tests: TestCase[] = [
      { name: 'formatMT formats Metical cents', run: () => {
        assert.equal(utils.formatMT(0), '0 MT');
        assert.equal(utils.formatMT(500), '5 MT');
        assert.equal(utils.formatMT(123456), '1 234,56 MT');
        assert.equal(utils.formatMT(-123456), '-1 234,56 MT');
      }},
      { name: 'slugify creates public-safe slugs', run: () => {
        assert.equal(utils.slugify('Barbearia Central MÁCIA!'), 'barbearia-central-macia');
        assert.equal(utils.slugify('  Café  &  Corte  '), 'cafe-corte');
      }},
      { name: 'humanError preserves business contracts', run: () => {
        assert.equal(utils.humanError({ message: 'SLOT_TAKEN' }), 'Esse horário foi ocupado. Escolhe outro.');
        assert.equal(utils.humanError({ message: 'INVALID_PHONE from booking' }), 'Número inválido. Usa o formato 84 000 0000.');
        assert.equal(utils.humanError({ message: 'unknown backend failure' }), 'Algo falhou. Tenta de novo.');
      }},
      { name: 'calendar output is escaped and structurally valid', run: () => {
        const appointment = {
          shop_name: 'Barbearia, Central', shop_slug: 'central', shop_address: 'Av. Julius Nyerere; Maputo',
          service_name: 'Corte; Premium', haircut_name: 'Low, Fade', barber_name: 'Nelson',
          appointment_starts_at: '2026-10-10T08:00:00.000Z', appointment_ends_at: '2026-10-10T08:40:00.000Z',
        };
        const ics = calendar.buildAppointmentCalendar(appointment, 'https://example.test/marcacao/token');
        assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
        assert.match(ics, /UID:barberos-central-/);
        assert.match(ics, /SUMMARY:Corte\\; Premium \\; Barbearia\\, Central/);
        assert.match(ics, /LOCATION:Av\. Julius Nyerere\\; Maputo/);
        assert.match(ics, /END:VCALENDAR$/);
      }},
      { name: 'WhatsApp link normalizes Mozambique numbers', run: () => {
        assert.match(calendar.buildWhatsAppLink('84 123 4567', 'Olá'), /^https:\/\/wa\.me\/258841234567\?text=/);
        assert.match(calendar.buildWhatsAppLink('+258841234567', 'Olá'), /^https:\/\/wa\.me\/258841234567\?text=/);
        assert.match(calendar.buildWhatsAppLink('258841234567', 'Olá'), /^https:\/\/wa\.me\/258841234567\?text=/);
      }},
      { name: 'permission matrix isolates roles', run: () => {
        assert.equal(permissions.canAccessAppRoute('owner', '/app/definicoes/pagamentos'), true);
        assert.equal(permissions.canAccessAppRoute('manager', '/app/definicoes/pagamentos'), false);
        assert.equal(permissions.canAccessAppRoute('barber', '/app/definicoes/pagamentos'), false);
        assert.equal(permissions.canAccessAppRoute('manager', '/app/agenda'), true);
        assert.equal(permissions.canAccessAppRoute('barber', '/app/agenda'), true);
        assert.equal(permissions.canAccessAppRoute(null, '/app/agenda'), false);
        assert.equal(permissions.canManageTeam('owner'), true);
        assert.equal(permissions.canManageTeam('manager'), false);
      }},
    ];
    let failed = 0;
    for (const test of tests) {
      try { await test.run(); console.log('PASS', test.name); }
      catch (error) { failed++; console.error('FAIL', test.name, error); }
    }
    console.log(`Phase 23 unit tests: ${tests.length - failed}/${tests.length} passed.`);
    if (failed) process.exitCode = 1;
  } finally { await server.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
