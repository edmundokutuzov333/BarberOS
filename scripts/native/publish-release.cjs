'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const version = process.env.NATIVE_VERSION;
const sha = process.env.BARBEROS_SOURCE_COMMIT || process.env.GITHUB_SHA;
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Missing immutable source/version');
const directory = path.resolve('native-artifacts');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
for (const file of walk(directory)) {
  if (path.basename(file) === 'app-release.apk') fs.renameSync(file, path.join(directory, `BarberOS-${version}-Android.apk`));
  if (path.basename(file) === 'app-release.aab') fs.renameSync(file, path.join(directory, `BarberOS-${version}-Android.aab`));
}
const assets = walk(directory).filter(file => /\.(dmg|zip|exe|apk|aab|blockmap)$/.test(file) || path.basename(file) === 'latest.yml');
if (assets.filter(x => x.endsWith('.dmg')).length !== 2 || !assets.some(x => x.endsWith('.exe')) || !assets.some(x => x.endsWith('.apk'))) throw new Error('Incomplete platform matrix');
const sums = assets.map(file => `${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}`).sort().join('\n') + '\n';
const checksumFile = path.join(directory, 'SHA256SUMS.txt'); fs.writeFileSync(checksumFile, sums);
const notesFile = path.join(directory, 'release-notes.md');
fs.writeFileSync(notesFile, `BarberOS ${version}\n\nSource main: ${sha}\n\nProduction: https://barber-os-orpin.vercel.app\n\nThe online interface follows production deployments from main. Native binary changes are versioned separately. macOS builds are ad-hoc signed test distributions, not Apple-notarized. Windows builds are test distributions without Authenticode signing. Android APK uses the stable release key linked to the production domain. The Android AAB is intended for future Play Console submission, not direct installation.\n\nChecks: desktop packaged production runtime on both macOS architectures and Windows; Android lint, release signature and live domain verification. See workflow artifacts for evidence.\n`);
const tag = `native-v${version}`;
const repository = process.env.GITHUB_REPOSITORY || 'edmundokutuzov333/BarberOS';
const releaseId = process.env.BARBEROS_RELEASE_ID;
if (!/^[1-9][0-9]*$/.test(releaseId || '')) throw new Error('Missing canonical reserved release ID');
const endpoint = `repos/${repository}/releases/${releaseId}`;
function api(args) { return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
const release = api([endpoint]);
if (!release.draft || release.tag_name !== tag || release.target_commitish !== sha) throw new Error('Reserved source/version differs or release is already public; never replace public assets');
for (const file of [...assets, checksumFile]) {
  const name = path.basename(file);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const size = fs.statSync(file).size;
  let uploaded = release.assets.find(value => value.name === name);
  const matches = asset => asset && asset.state === 'uploaded' && asset.name === name && asset.size === size && asset.digest === `sha256:${digest}`;
  if (uploaded && !matches(uploaded)) {
    // Only this still-private, source-matched reservation can be repaired.
    execFileSync('gh', ['api', '--method', 'DELETE', `repos/${repository}/releases/assets/${uploaded.id}`], { stdio: 'inherit' });
    uploaded = null;
  }
  if (!uploaded) uploaded = api(['--method', 'POST', `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, '--header', 'Content-Type: application/octet-stream', '--input', file]);
  // Use the authoritative mutation response, not an eventually consistent
  // release listing. A missing observation must never repeat a successful write.
  if (!matches(uploaded)) throw new Error(`Remote artifact verification failed: ${name}`);
  console.log(`Verified ${name}`);
}
const published = api(['--method', 'PATCH', endpoint, '-F', 'draft=false', '-f', 'make_latest=true', '-f', `body=${fs.readFileSync(notesFile, 'utf8')}`]);
if (published.id !== Number(releaseId) || published.draft || published.tag_name !== tag) throw new Error('Publication response differs from the verified reservation');
console.log(`Published ${published.html_url} from ${sha}`);
