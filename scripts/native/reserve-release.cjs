'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const repository = process.env.GITHUB_REPOSITORY || 'edmundokutuzov333/BarberOS';
const version = process.env.NATIVE_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !process.env.GITHUB_OUTPUT) throw new Error('Reservation requires a CI version and output file');
const tag = `native-v${version}`;
function api(endpoint) { return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
function head() { return api(`repos/${repository}/commits/main`).sha; }
function draft() {
  const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const matches = pages.flat().filter(value => value.tag_name === tag);
  if (matches.length > 1) throw new Error('Ambiguous draft reservation; refuse to choose between duplicate release IDs');
  return matches[0];
}
let reserved = draft();
for (let attempt = 0; !reserved && attempt < 4; attempt++) {
  const source = head();
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('Invalid main source');
  try {
    // Reserve while this exact source is the default-branch head. GitHub's
    // contents-only token cannot create a release against older workflow files.
    reserved = JSON.parse(execFileSync('gh', ['api', '--method', 'POST', `repos/${repository}/releases`, '-f', `tag_name=${tag}`, '-f', `target_commitish=${source}`, '-F', 'draft=true', '-f', `name=BarberOS ${version} — macOS, Windows e Android`, '-f', `body=Native build pending. Immutable source main: ${source}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    reserved = draft();
    if (reserved) break;
    if (head() === source || !String(error.stderr).includes('403')) throw error;
    console.log('Main advanced during reservation; retrying a fresh source before any build starts.');
  }
}
if (!Number.isSafeInteger(reserved?.id) || !reserved?.draft || !/^[a-f0-9]{40}$/.test(reserved.target_commitish || '')) throw new Error('Missing immutable unpublished reservation; never overwrite a public version');
const comparison = api(`repos/${repository}/compare/${reserved.target_commitish}...main`);
if (!['identical', 'ahead'].includes(comparison.status)) throw new Error('Reserved source is no longer in main history');
fs.appendFileSync(process.env.GITHUB_OUTPUT, `source_sha=${reserved.target_commitish}\nrelease_id=${reserved.id}\n`);
console.log(`Reserved ${tag} from main ${reserved.target_commitish}; every platform must check out this same source.`);
