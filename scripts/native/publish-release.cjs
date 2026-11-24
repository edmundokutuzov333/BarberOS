'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const version = process.env.NATIVE_VERSION;
const sha = process.env.GITHUB_SHA;
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
execFileSync('gh', ['release', 'create', `native-v${version}`, '--target', sha, '--title', `BarberOS ${version} — macOS, Windows e Android`, '--notes-file', notesFile, ...assets, checksumFile], { stdio: 'inherit' });
