import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const tests = [
  ['Appointments route is a real production surface', () => {
    const app = read('src/App.tsx');
    const page = read('src/pages/app/Marcacoes.tsx');
    const api = read('src/features/appointments/api.ts');
    assert.match(app, /path="marcacoes" element={<Marcacoes \/>}/);
    assert.match(page, /data-testid="appointments-page"/);
    assert.match(page, /useAppointments\(/);
    assert.doesNotMatch(page, /NotYet/);
    assert.match(api, /get_appointments/);
  }],
  ['Appointment page uses shop timezone and real shop name in customer contact', () => {
    const page = read('src/pages/app/Marcacoes.tsx');
    assert.match(page, /fmt\(a\.starts_at, 'yyyy-MM-dd'\) === fmt\(new Date\(\), 'yyyy-MM-dd'\)/);
    assert.match(page, /shopName=\{shop\.name\}/);
    assert.doesNotMatch(page, /function shopName\(/);
  }],
  ['Auth and tenant context fail closed without deadlocking', () => {
    const auth = read('src/lib/auth.tsx');
    const shop = read('src/lib/shop.tsx');
    const shell = read('src/components/layout/AppShell.tsx');
    assert.match(auth, /\.catch\(\(\) =>/);
    assert.match(auth, /setLoading\(false\)/);
    assert.match(shop, /error: q\.error/);
    assert.match(shell, /if \(error\) return/);
  }],
  ['Admin shop listing uses the platform read model', () => {
    const page = read('src/pages/admin/AdminBarbearias.tsx');
    assert.match(page, /useAdminShops\(/);
    assert.doesNotMatch(page, /from\('barbershops'\)/);
    assert.doesNotMatch(page, /appointments\(count\)/);
  }],
  ['Public copy follows the product voice', () => {
    const booking = read('src/pages/BookingWizard.tsx');
    const waitlist = read('src/features/waitlist/WaitlistJoinPanel.tsx');
    assert.doesNotMatch(booking, /teu nome|Usa um número móvel/);
    assert.doesNotMatch(waitlist, /teu nome|Usa um número móvel/);
    assert.match(booking, /seu nome/);
    assert.match(waitlist, /seu nome/);
  }],
  ['Sensitive domain tables are not written directly by frontend features', () => {
    for (const file of [
      'src/features/booking/api.ts',
      'src/features/appointments/token-api.ts',
      'src/features/agenda/api.ts',
      'src/features/notifications/api.ts',
      'src/features/payments/api.ts',
      'src/features/reviews/api.ts',
      'src/features/waitlist/api.ts',
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /from\(['"](?:appointments|payments|notifications|reviews|waitlist_entries)['"]\)[\s\S]{0,300}\.(?:insert|update|delete)\s*\(/);
    }
  }],
];

let failed = 0;
for (const [name, run] of tests) {
  try { run(); console.log('PASS', name); }
  catch (error) { failed++; console.error('FAIL', name, error); }
}
console.log('Release audit frontend contracts: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
if (failed) process.exitCode = 1;
