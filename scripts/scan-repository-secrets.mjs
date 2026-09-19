import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const blocked = /(?:sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY\s*=\s*['\"][^'\"]{12,}['\"])/i;
const ignored = new Set(['.git','node_modules','dist','build','.vite']);
const allowedNames = new Set(['.env.example','frontend/.env.example']);
let failures = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) {
      const rel = path.relative(root, full).replaceAll(path.sep, '/');
      if (allowedNames.has(rel)) continue;
      if (full.endsWith('.png') || full.endsWith('.jpg') || full.endsWith('.jpeg') || full.endsWith('.webp') || full.endsWith('.zip')) continue;
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { return; }
      if (blocked.test(content)) {
        failures += 1;
        console.error('SECRET_PATTERN_FOUND:' + rel);
      }
    }
  }
}

walk(root);
if (failures) process.exitCode = 1;
else console.log('PASS | repository secret pattern scan');
