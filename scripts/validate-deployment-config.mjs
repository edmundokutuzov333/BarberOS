import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const vercel = JSON.parse(read('vercel.json'));
if (vercel.outputDirectory !== 'frontend/dist') throw new Error('DEPLOY_CONFIG_OUTPUT_DIRECTORY_INVALID');
if (!String(vercel.buildCommand || '').includes('frontend') || !String(vercel.buildCommand || '').includes('yarn build')) {
  throw new Error('DEPLOY_CONFIG_BUILD_COMMAND_INVALID');
}
if (!String(vercel.installCommand || '').includes('yarn install --frozen-lockfile')) {
  throw new Error('DEPLOY_CONFIG_INSTALL_COMMAND_INVALID');
}
if (!Array.isArray(vercel.rewrites) || !vercel.rewrites.some((r) => r.source === '/(.*)' && r.destination === '/index.html')) {
  throw new Error('DEPLOY_CONFIG_SPA_REWRITE_MISSING');
}
if (!Array.isArray(vercel.headers) || !vercel.headers.some((h) => h.source === '/(.*)')) {
  throw new Error('DEPLOY_CONFIG_SECURITY_HEADERS_MISSING');
}
if (!vercel.headers.some((h) => h.source === '/assets/(.*)' && h.headers?.some((x) => x.key === 'Cache-Control' && x.value.includes('immutable')))) {
  throw new Error('DEPLOY_CONFIG_ASSET_CACHE_MISSING');
}

if (read('.nvmrc').trim() !== '22') throw new Error('DEPLOY_CONFIG_NODE_VERSION_INVALID');

const frontendPackage = JSON.parse(read('frontend/package.json'));
if (!String(frontendPackage.packageManager || '').startsWith('yarn@1.22.22')) {
  throw new Error('DEPLOY_CONFIG_PACKAGE_MANAGER_INVALID');
}
if (frontendPackage.engines?.node !== '22.x') throw new Error('DEPLOY_CONFIG_FRONTEND_NODE_ENGINE_INVALID');

const supabaseConfig = read('supabase/config.toml');
if (!supabaseConfig.includes('project_id = "alseiinjzwjdiwtvkdzy"')) throw new Error('DEPLOY_CONFIG_SUPABASE_PROJECT_INVALID');
if (!supabaseConfig.includes('[functions]')) throw new Error('DEPLOY_CONFIG_SUPABASE_FUNCTIONS_CONFIG_MISSING');

for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith('VITE_')) continue;
  if (/(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|ACCESS_TOKEN)/i.test(key)) {
    throw new Error('DEPLOY_PUBLIC_ENV_SECRET_PREFIX:' + key);
  }
  if (value && key === 'VITE_SUPABASE_PUBLISHABLE_KEY' && !value.startsWith('sb_publishable_')) {
    throw new Error('DEPLOY_PUBLIC_KEY_NOT_PUBLISHABLE');
  }
}

if (process.env.DEPLOY_PREFLIGHT === 'production') {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || '';
  const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(supabaseUrl)) throw new Error('DEPLOY_PRODUCTION_SUPABASE_URL_INVALID');
  if (!publishable.startsWith('sb_publishable_')) throw new Error('DEPLOY_PRODUCTION_PUBLISHABLE_KEY_MISSING');
}

console.log('PASS | Phase 26 deployment configuration contract');
