import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const edge = read("../supabase/functions/gmail-integration/index.ts");
const migration = read("../supabase/migrations/20261021130000_gmail_workspace_integration.sql");
const api = read("src/features/gmail/api.ts");
const page = read("src/pages/app/Comunicacoes.tsx");
const app = read("src/App.tsx");
const nav = read("src/components/layout/nav.ts");
const permissions = read("src/lib/permissions.ts");
const config = read("../supabase/config.toml");

const tests = [
  ["Gmail is registered as an authenticated management route", () => {
    assert.match(app, /path="comunicacoes" element={<Comunicacoes \/>}/);
    assert.match(nav, /to: '\/app\/comunicacoes'.*label: 'Gmail'/);
    assert.match(permissions, /prefix: '\/app\/comunicacoes', roles: MANAGEMENT_ROLES/);
  }],
  ["Browser calls a server-side Edge Function rather than Gmail directly", () => {
    assert.match(api, /functions\.invoke<GmailResponse>\("gmail-integration"/);
    assert.doesNotMatch(api, /accounts\.google\.com|gmail\.googleapis\.com/);
    assert.match(page, /Gmail ainda não configurado/);
  }],
  ["OAuth state is random, hashed, short lived, and single use", () => {
    assert.match(edge, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
    assert.match(edge, /state_hash:await hash\(state\)/);
    assert.match(edge, /Date\.now\(\)\+600_000/);
    assert.match(edge, /from\("gmail_oauth_states"\)\.delete\(\)\.eq\("state_hash",stateHash\)/);
  }],
  ["OAuth access and refresh tokens use authenticated encryption", () => {
    assert.match(edge, /name: "AES-GCM"/);
    assert.match(edge, /GMAIL_TOKEN_ENCRYPTION_KEY/);
    assert.match(edge, /access_token_ciphertext: await encrypt\(token\.access\)|access_token_ciphertext:await encrypt\(token\.access\)/);
    assert.match(edge, /refresh_token_ciphertext: await encrypt\(token\.refresh\)|refresh_token_ciphertext:refreshCipher/);
    assert.doesNotMatch(page, /GMAIL_CLIENT_SECRET|GMAIL_TOKEN_ENCRYPTION_KEY/);
  }],
  ["Every action verifies authenticated owner or manager membership", () => {
    assert.match(edge, /admin\.auth\.getUser\(bearer\[1\]\)/);
    assert.match(edge, /data\.role !== "owner" && data\.role !== "manager"/);
    assert.match(edge, /from\("barbershop_members"\)/);
  }],
  ["Database blocks browser roles from connection and OAuth-state records", () => {
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /force row level security/i);
    assert.match(migration, /revoke all on table public\.gmail_connections from public, anon, authenticated/i);
    assert.match(migration, /revoke all on table public\.gmail_oauth_states from public, anon, authenticated/i);
    assert.match(migration, /grant all on public\.gmail_connections to service_role/i);
  }],
  ["Gmail can list and read conversations and supports reply headers", () => {
    assert.match(edge, /threads\?/);
    assert.match(edge, /threads\/" \+ encodeURIComponent/);
    assert.match(edge, /In-Reply-To/);
    assert.match(edge, /References/);
    assert.match(edge, /gmail\.send/);
  }],
  ["Function is registered without gateway JWT so Google can reach OAuth callback", () => {
    assert.match(config, /\[functions\.gmail-integration\]\s+verify_jwt = false/);
    assert.match(edge, /url\.searchParams\.has\("code"\)/);
  }],
];

let failed = 0;
for (const [name, run] of tests) {
  try { run(); console.log("PASS", name); }
  catch (error) { failed += 1; console.error("FAIL", name, error); }
}
console.log("Gmail integration contracts: " + (tests.length - failed) + "/" + tests.length + " passed.");
if (failed) process.exitCode = 1;
