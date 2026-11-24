import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null;
if (commit !== null && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid web source commit');
fs.writeFileSync(path.join(root, 'frontend/public/native-release.json'), JSON.stringify({ schema: 1, application: 'BarberOS', channel: 'production', sourceCommit: commit, builtAt: new Date().toISOString(), backend: 'alseiinjzwjdiwtvkdzy', nativeDownloads: 'https://github.com/edmundokutuzov333/BarberOS/releases/latest' }, null, 2) + '\n');
