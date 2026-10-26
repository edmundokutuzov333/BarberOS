import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const edge = read('../supabase/functions/google-calendar/index.ts');
const config = read('../supabase/config.toml');
const page = read('src/pages/AppointmentManage.tsx');
const api = read('src/features/appointments/google-calendar.ts');
const privacy = read('src/pages/Legal.tsx');
const docs = read('../docs/GOOGLE_CALENDAR_INTEGRATION.md');

const tests = [
  ['Google Calendar is registered as a public OAuth callback, not as an authenticated browser API', () => {
    assert.match(config, /\[functions\.google-calendar\]\s+verify_jwt = false/);
    assert.match(edge, /url\.searchParams\.has\("code"\)/);
    assert.match(edge, /body\.action !== "authorize"/);
    assert.match(edge, /authorization_url/);
  }],
  ['OAuth state is encrypted, short-lived, and rejects invalid or expired booking tokens', () => {
    assert.match(edge, /name: "AES-GCM"/);
    assert.match(edge, /GOOGLE_CALENDAR_STATE_SECRET/);
    assert.match(edge, /STATE_TTL_MS = 10 \* 60 \* 1000/);
    assert.match(edge, /manage_token_expires_at/);
    assert.match(edge, /assertActiveAppointment\(appointment\)/);
    assert.match(edge, /Date\.parse\(record\.manage_token_expires_at\) <= Date\.now\(\)/);
  }],
  ['Calendar scope is limited to creating events in calendars owned by the customer', () => {
    assert.match(edge, /calendar\.events\.owned/);
    assert.doesNotMatch(edge, /calendar\.readonly|calendar\.events\.readonly|auth\/calendar"/);
    assert.match(edge, /visibility: "private"/);
    assert.match(edge, /reminders: \{ useDefault: true \}/);
  }],
  ['Calendar tokens are not persisted and event identifiers prevent duplicate events', () => {
    assert.match(edge, /const GOOGLE_TOKEN = "https:\/\/oauth2\.googleapis\.com\/token"/);
    assert.match(edge, /createOrUpdateEvent/);
    assert.match(edge, /method: "PATCH"/);
    assert.match(edge, /const \{ id: immutableEventId, \.\.\.patchBody \} = body/);
    assert.match(edge, /barberos-google-calendar:/);
    assert.doesNotMatch(edge, /refresh_token_ciphertext|from\("google_calendar_connections"\)/);
  }],
  ['Public OAuth start is rate limited and CORS uses explicit production allowlist', () => {
    assert.match(edge, /consume\(admin, "calendar-ip:/);
    assert.match(edge, /consume\(admin, "calendar-token:/);
    assert.match(edge, /corsHeaders\(req\)/);
    assert.match(edge, /rateLimitSalt\(\)/);
  }],
  ['Customer page offers direct Google Calendar insert and clear callback feedback', () => {
    assert.match(page, /Guardar no Google Calendar/);
    assert.match(page, /getGoogleCalendarAuthorizationUrl/);
    assert.match(page, /Marcação adicionada ao Google Calendar/);
    assert.match(page, /A autorização do Google Calendar foi cancelada/);
    assert.match(api, /supabase\.functions\.invoke<GoogleCalendarStartResponse>\('google-calendar'/);
    assert.match(api, /accounts\.google\.com/);
  }],
  ['Privacy and deployment documentation disclose OAuth consent and server-only configuration', () => {
    assert.match(privacy, /Integração opcional com Google Calendar/);
    assert.match(privacy, /calendar\.events\.owned/);
    assert.match(docs, /GOOGLE_CALENDAR_CLIENT_SECRET/);
    assert.match(docs, /GOOGLE_CALENDAR_STATE_SECRET/);
    assert.match(docs, /GOOGLE_CALENDAR_APP_URL/);
    assert.match(docs, /functions\/v1\/google-calendar/);
  }],
];

let failed = 0;
for (const [name, run] of tests) {
  try { run(); console.log('PASS', name); }
  catch (error) { failed += 1; console.error('FAIL', name, error); }
}
console.log('Google Calendar contracts: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
if (failed) process.exitCode = 1;
