const base = (process.env.BARBEROS_PUBLIC_URL || '').replace(/\/+$/, '');
if (!base) {
  console.log('SKIP | BARBEROS_PUBLIC_URL is not configured');
  process.exit(0);
}

const routes = ['/', '/entrar', '/barbearia/oryon'];
const requiredHeaders = [
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['strict-transport-security', 'max-age=31536000'],
];

let failed = 0;

for (const route of routes) {
  const url = base + route;
  try {
    const response = await fetch(url, { redirect: 'follow' });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (response.status !== 200) throw new Error('HTTP_' + response.status);
    if (!contentType.includes('text/html')) throw new Error('CONTENT_TYPE_' + contentType);
    if (!text.includes('BarberOS')) throw new Error('APP_MARKER_MISSING');

    for (const [name, fragment] of requiredHeaders) {
      const value = response.headers.get(name) || '';
      if (!value.includes(fragment)) throw new Error(name.toUpperCase() + '_MISSING');
    }

    console.log('PASS | production route | ' + route);
  } catch (error) {
    failed += 1;
    console.error('FAIL | production route | ' + route + ' | ' + String(error));
  }
}

if (failed) process.exitCode = 1;
else console.log('PASS | Phase 26 production smoke');
