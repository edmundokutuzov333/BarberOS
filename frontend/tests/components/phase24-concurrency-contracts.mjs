import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const tests = [
  ['booking API uses server HTTP boundary and not direct sensitive appointment writes', () => {
    const source = read('src/features/booking/api.ts');
    assert.match(source, /functions\.invoke\('booking-create'/);
    assert.doesNotMatch(source, /rpc\('book_appointment'/);
    assert.match(source, /BookingRequestError/);
    assert.match(source, /status/);
  }],
  ['booking UX treats a collision as recoverable and refreshes availability', () => {
    const source = read('src/pages/BookingWizard.tsx');
    assert.match(source, /SLOT_TAKEN/);
    assert.match(source, /setBookingError/);
    assert.match(source, /setSearchParams/);
    assert.match(source, /slotsQuery\.refetch\(\)/);
    assert.match(source, /loading=\{bookMutation\.isPending\}/);
  }],
  ['public response never requires appointment id', () => {
    const source = read('src/features/booking/api.ts');
    assert.match(source, /manage_token/);
    assert.match(source, /deposit_cents/);
    assert.match(source, /needs_payment/);
    assert.doesNotMatch(source, /appointment_id.*manage_token/);
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

console.log('Phase 24 component/page contracts: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
if (failed) process.exitCode = 1;
