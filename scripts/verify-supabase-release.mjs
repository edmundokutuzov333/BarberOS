import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = path.join(root, 'supabase', 'migrations');
const functionDir = path.join(root, 'supabase', 'functions');
const names = fs.readdirSync(migrationDir).filter((n) => n.endsWith('.sql')).sort();

if (!names.length) throw new Error('SUPABASE_MIGRATION_DIRECTORY_EMPTY');

let previous = '';
for (const name of names) {
  const version = name.split('_', 1)[0];
  if (!/^\d{14}$/.test(version)) throw new Error('SUPABASE_MIGRATION_TIMESTAMP_INVALID:' + name);
  if (version <= previous) throw new Error('SUPABASE_MIGRATION_ORDER_INVALID:' + name);
  previous = version;
  const content = fs.readFileSync(path.join(migrationDir, name), 'utf8');
  if (/^\s*undefined\s*$/m.test(content)) throw new Error('SUPABASE_MIGRATION_LITERAL_UNDEFINED:' + name);
  if (/(?:\$(?:function|fn|block|body)\$|\$\$)\s*\n\s*(?:revoke|grant|create|alter|comment|insert|update|delete|drop)\b/i.test(content)) {
    throw new Error('SUPABASE_MIGRATION_MISSING_DOLLAR_QUOTE_TERMINATOR:' + name);
  }
  if (/\bCOMMIT\s*;/i.test(content) || /\bROLLBACK\s*;/i.test(content)) {
    throw new Error('SUPABASE_MIGRATION_TRANSACTION_CONTROL_FORBIDDEN:' + name);
  }
}

const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
if (!config.includes('project_id = "alseiinjzwjdiwtvkdzy"')) throw new Error('SUPABASE_PROJECT_REF_MISMATCH');

const historicalMigration = '20260919005227_release_audit_appointments_read_model.sql';
if (!names.includes(historicalMigration)) throw new Error('PRODUCTION_HISTORY_MIGRATION_MISSING');
const historicalSource = fs.readFileSync(path.join(migrationDir, historicalMigration), 'utf8');
if (!historicalSource.includes('public.get_appointments') || !historicalSource.includes('revoke all on function public.get_appointments')) {
  throw new Error('PRODUCTION_HISTORY_MIGRATION_CONTRACT_MISSING');
}

const requiredMigration = '20261019170000_token_rpc_lockdown.sql';
if (!names.includes(requiredMigration)) throw new Error('BOOKING_SECURITY_MIGRATION_MISSING');
const bookingMigration = fs.readFileSync(path.join(migrationDir, '20261019160000_payment_rpc_privilege_lockdown.sql'), 'utf8');
for (const required of [
  'public.book_appointment_idempotent',
  'revoke all on function public.book_appointment_idempotent',
  'revoke all on function public.book_appointment(text',
  'from public, anon, authenticated',
]) {
  if (!bookingMigration.includes(required)) throw new Error('BOOKING_SECURITY_MIGRATION_CONTRACT_MISSING:' + required);
}
const tokenMigration = fs.readFileSync(path.join(migrationDir, requiredMigration), 'utf8');
if (!tokenMigration.includes('p.proname like')
  || !tokenMigration.includes('get_waitlist_offer')
  || !tokenMigration.includes('expire_waitlist_offer')
  || !tokenMigration.includes('grant execute on function %s to service_role')) {
  throw new Error('TOKEN_RPC_LOCKDOWN_CONTRACT_MISSING');
}

for (const fn of ['booking-create', 'token-gateway', 'health', 'resend-webhook']) {
  if (!fs.existsSync(path.join(functionDir, fn, 'index.ts'))) {
    throw new Error('REQUIRED_EDGE_FUNCTION_MISSING:' + fn);
  }
}
if (!config.includes('[functions.token-gateway]')) throw new Error('TOKEN_GATEWAY_NOT_REGISTERED');

const bookingSource = fs.readFileSync(path.join(functionDir, 'booking-create', 'index.ts'), 'utf8');
if (!bookingSource.includes('book_appointment_idempotent')) throw new Error('BOOKING_EDGE_RPC_CONTRACT_MISSING');
const wizardPath = path.join(root, 'frontend', 'src', 'pages', 'BookingWizard.tsx');
const wizard = fs.readFileSync(wizardPath, 'utf8');
if (!wizard.includes('Boolean(turnstileSiteKey && turnstileToken)')
  || !wizard.includes("VITE_BOOKING_TURNSTILE_REQUIRED === 'true'")) {
  throw new Error('BOOKING_TURNSTILE_ROLLOUT_GUARD_MISSING');
}
if (!wizard.includes('turnstile_token: turnstileToken ?? undefined')) {
  throw new Error('BOOKING_TURNSTILE_TOKEN_NOT_SENT');
}

console.log(JSON.stringify({
  migrations: names.length,
  latest: names.at(-1),
  project_ref: 'alseiinjzwjdiwtvkdzy',
  required_edge_functions: ['booking-create', 'token-gateway', 'health', 'resend-webhook'],
  booking_security_contract: 'fail-closed Turnstile + idempotency + token gateway',
}, null, 2));
console.log('PASS | Supabase release contract');
