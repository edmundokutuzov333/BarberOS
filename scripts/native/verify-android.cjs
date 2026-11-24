'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
(async () => {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Android SDK not configured');
  const versions = fs.readdirSync(path.join(sdk, 'build-tools')).filter(value => /^\d/.test(value)).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  const apk = path.join(root, 'apps/android/app/build/outputs/apk/release/app-release.apk');
  const output = execFileSync(path.join(sdk, 'build-tools', versions[0], 'apksigner'), ['verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' });
  const digest = /certificate SHA-256 digest: ([a-f0-9]+)/i.exec(output)?.[1]?.toUpperCase();
  if (!digest) throw new Error('Signed APK certificate not found');
  const fingerprint = digest.match(/.{2}/g).join(':');
  const local = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/.well-known/assetlinks.json')));
  const matches = value => value.some(entry => entry.target?.package_name === 'app.barberos.mobile' && entry.target.sha256_cert_fingerprints?.includes(fingerprint));
  if (!matches(local)) throw new Error('APK signing identity differs from versioned Digital Asset Links');
  let valid = false;
  for (let i = 0; i < 18 && !valid; i++) {
    try { const response = await fetch('https://barber-os-orpin.vercel.app/.well-known/assetlinks.json', { signal: AbortSignal.timeout(15000), redirect: 'error' }); valid = response.ok && matches(await response.json()); } catch {}
    if (!valid) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!valid) throw new Error('Production domain has not published the matching Android certificate; do not publish an unverified TWA');
  console.log('PASS | APK signature and live Digital Asset Links match');
})().catch(error => { console.error(error); process.exitCode = 1; });
