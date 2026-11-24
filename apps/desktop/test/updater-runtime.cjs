'use strict';
const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
(async () => {
  assert.equal(process.platform, 'win32', 'Exercise NSIS updater semantics on Windows');
  const executablePath = process.env.BARBEROS_EXECUTABLE;
  assert.ok(executablePath);
  const output = path.resolve(process.env.BARBEROS_EVIDENCE || 'release/runtime-evidence');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'barberos-update-policy-'));
  let version, fail = false, forbiddenDownload = false, app;
  const server = http.createServer((request, response) => {
    if (!request.url.startsWith('/latest.yml')) { forbiddenDownload = true; response.writeHead(500).end(); return; }
    if (fail) { response.writeHead(503).end('Controlled update service outage'); return; }
    response.writeHead(200, { 'Content-Type': 'text/yaml', 'Cache-Control': 'no-store' });
    response.end(`version: ${version}\nfiles:\n  - url: never-download.exe\n    sha512: ${Buffer.alloc(64).toString('base64')}\n    size: 1\npath: never-download.exe\nsha512: ${Buffer.alloc(64).toString('base64')}\nreleaseDate: '2026-11-24T00:00:00.000Z'\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], timeout: 60000 });
    await app.firstWindow({ timeout: 60000 });
    const current = await app.evaluate(({ app }) => app.getVersion());
    await app.evaluate(({ dialog }, url) => {
      const updater = process.mainModule.require('electron-updater').autoUpdater;
      updater.setFeedURL({ provider: 'generic', url });
      updater.logger = { info() {}, debug() {}, warn() {}, error() {} };
      globalThis.__barberosUpdatePolicy = { messages: [] };
      dialog.showMessageBox = async (_window, options) => { globalThis.__barberosUpdatePolicy.messages.push(options.message); return { response: 1, checkboxChecked: false }; };
    }, `http://127.0.0.1:${server.address().port}/`);
    async function check(expected) {
      await app.evaluate(async ({ Menu }) => {
        globalThis.__barberosUpdatePolicy.messages = [];
        const find = menu => { for (const item of menu.items) { if (item.label === 'Procurar actualizações…') return item; const nested = item.submenu && find(item.submenu); if (nested) return nested; } };
        const item = find(Menu.getApplicationMenu());
        if (!item) throw new Error('Actual update menu missing');
        await item.click();
      });
      const until = Date.now() + 30000;
      let messages;
      do {
        messages = await app.evaluate(() => globalThis.__barberosUpdatePolicy.messages);
        if (messages.length) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < until);
      assert.deepEqual(messages, [expected]);
      // Allow the handler's finally block to finish before exercising recovery.
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    version = current;
    await check('A aplicação está actualizada.');
    version = '0.0.1';
    await check('A aplicação está actualizada.');
    fail = true;
    await check('Não foi possível verificar a actualização.');
    fail = false;
    version = current;
    await check('A aplicação está actualizada.');
    assert.equal(forbiddenDownload, false, 'Equal/older versions must never download or execute an installer');
    await fs.writeFile(path.join(output, 'update-policy.json'), JSON.stringify({ passed: true, currentVersion: current, checks: ['same-version-no-offer', 'older-version-no-offer', 'server-failure-visible', 'retry-after-failure', 'no-installer-download'] }, null, 2));
    console.log('PASS | actual packaged update menu: no downgrade, no repeated version, failure and retry');
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
