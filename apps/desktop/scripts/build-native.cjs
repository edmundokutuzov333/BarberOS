'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Build desktop distributions on their supported macOS/Windows runner');
const env = { ...process.env };
if (process.platform === 'darwin' && !env.SDKROOT) {
  const developer = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim();
  const sdk = path.join(developer, 'Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk');
  if (fs.existsSync(sdk)) env.SDKROOT = sdk;
}
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/node-gyp/bin/node-gyp.js'), 'rebuild', '--directory', path.join(root, 'native')], { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
