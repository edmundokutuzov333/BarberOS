import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const tests = [
  ['shared dialogs stay centered and internally scrollable on short viewports', () => {
    const modal = read('src/components/ui/Primitives.tsx');
    const dialog = read('src/components/ui/dialog.jsx');
    const alertDialog = read('src/components/ui/alert-dialog.jsx');
    for (const source of [modal, dialog, alertDialog]) {
      assert.match(source, /fixed inset-x-4 top-4 bottom-4 z-50 m-auto/);
      assert.match(source, /max-h-\[calc\(100dvh-2rem\)\] overflow-y-auto/);
      assert.doesNotMatch(source, /translate-y-\[-50%\]|slide-in-from-top-\[48%\]/);
    }
  }],
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
  ['public booking has no CAPTCHA dependency and retains server-side protections', () => {
    const wizard = read('src/pages/BookingWizard.tsx');
    const api = read('src/features/booking/api.ts');
    const edge = read('../supabase/functions/booking-create/index.ts');
    assert.doesNotMatch(wizard, /turnstile|captcha|cloudflare/i);
    assert.doesNotMatch(api, /turnstile_token/i);
    assert.doesNotMatch(edge, /verifyTurnstile|turnstile_token/i);
    assert.match(edge, /consume\(/);
    assert.match(edge, /idempotency_key/);
  }],
  ['every new booking uses the fingerprinted atomic SQL path, with legacy no-product replay narrowly bounded', () => {
    const edge = read('../supabase/functions/booking-create/index.ts');
    const calls = [...edge.matchAll(/admin\.rpc\("(book_appointment[^\"]*)"/g)].map((match) => match[1]);
    assert.deepEqual(calls, ['book_appointment_with_shop_order_idempotent']);
    assert.match(edge, /select\("response,request_hash"\)/);
    assert.match(edge, /cached\.request_hash !== requestHash/);
    assert.match(edge, /shopItems\.length > 0 \|\| cachedValue\?\.shop_order/);
  }],
  ['booking uses atomic SQL idempotency and locks down provider credentials', () => {
    const edge = read('../supabase/functions/booking-create/index.ts');
    const migration = read('../supabase/migrations/20261019160000_payment_rpc_privilege_lockdown.sql');
    const bookingMigration = read('../supabase/migrations/20261019110000_booking_gateway_hardening.sql');
    assert.match(edge, /rpc\("book_appointment_with_shop_order_idempotent"/);
    assert.match(edge, /p_request_hash: requestHash/);
    assert.match(edge, /cached\.request_hash !== requestHash/);
    assert.match(migration, /on conflict \(key\) do nothing/i);
    assert.match(migration, /revoke all on function public\.get_payment_runtime_for_token\(uuid\)/i);
    assert.match(migration, /grant execute on function public\.book_appointment_idempotent/i);
    assert.match(bookingMigration, /grant select on public\.booking_idempotency to service_role/i);
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
