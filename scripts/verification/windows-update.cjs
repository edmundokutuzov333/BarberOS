'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const desktopRequire = createRequire(path.resolve('apps/desktop/package.json'));
const { _electron } = desktopRequire('playwright-core');
const mode = process.argv[2];
(async () => {
  assert.equal(process.platform, 'win32', 'Run installer upgrade acceptance on Windows');
  assert.ok(['download', 'verify'].includes(mode));
  const contextFile = process.env.BARBEROS_UPDATE_CONTEXT;
  const context = JSON.parse(await fs.readFile(contextFile, 'utf8'));
  const evidence = path.resolve('windows-update-evidence');
  await fs.mkdir(evidence, { recursive: true });
  let application, profile, keepProfile = false;
  try {
    profile = mode === 'download' ? await fs.mkdtemp(path.join(os.tmpdir(), 'barberos-updater-')) : context.profile;
    assert.equal(path.dirname(profile).toLowerCase(), os.tmpdir().toLowerCase());
    assert.ok(path.basename(profile).startsWith('barberos-updater-'));
    application = await _electron.launch({ executablePath: context.executable, args: [`--user-data-dir=${profile}`], timeout: 60000 });
    const page = await application.firstWindow({ timeout: 60000 });
    await page.waitForURL('https://barber-os-orpin.vercel.app/**', { timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 60000 });
    const version = await application.evaluate(({ app }) => app.getVersion());
    if (mode === 'download') {
      assert.equal(version, context.fromVersion);
      const marker = crypto.randomUUID();
      await page.evaluate(value => localStorage.setItem('barberos-update-acceptance', value), marker);
      await application.evaluate(({ Menu, dialog }) => {
        const updater = process.mainModule.require('electron-updater').autoUpdater;
        const state = globalThis.__barberosUpdateAcceptance = { messages: [], errors: [], downloadedFile: null };
        const clean = value => String(value).replace(/https?:\/\/[^\s]+/g, url => { try { const parsed = new URL(url); return parsed.origin + parsed.pathname; } catch { return '[download URL]'; } });
        updater.logger = { info() {}, debug() {}, warn(value) { state.errors.push(clean(value)); }, error(value) { state.errors.push(clean(value)); } };
        updater.on('update-downloaded', event => { state.downloadedFile = event.downloadedFile; state.downloadedVersion = event.version; });
        dialog.showMessageBox = async (_window, options) => {
          state.messages.push(options.message);
          // Automate only the two actual application consent dialogs. The
          // downloaded installer is exercised separately with NSIS silent flags.
          return { response: options.message.startsWith('BarberOS ') && options.message.endsWith(' disponível') ? 0 : 1, checkboxChecked: false };
        };
        const find = menu => {
          for (const item of menu.items) { if (item.label === 'Procurar actualizações…') return item; const nested = item.submenu && find(item.submenu); if (nested) return nested; }
          return null;
        };
        const item = find(Menu.getApplicationMenu());
        if (!item) throw new Error('Actual application update menu missing');
        item.click();
      });
      let state;
      const deadline = Date.now() + 240000;
      do {
        state = await application.evaluate(() => globalThis.__barberosUpdateAcceptance);
        if (state.messages.some(value => value.startsWith('Não foi possível'))) throw new Error('Actual updater failed: ' + JSON.stringify(state));
        if (state.messages.length >= 2 && state.downloadedFile) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } while (Date.now() < deadline);
      assert.equal(state.downloadedVersion, context.targetVersion);
      assert.deepEqual(state.messages, [`BarberOS ${context.targetVersion} disponível`, 'Actualização transferida e verificada. Reiniciar?']);
      const downloadedHash = crypto.createHash('sha256').update(await fs.readFile(state.downloadedFile)).digest('hex');
      assert.equal(downloadedHash, context.expectedSha256, 'Actual updater bytes must match the published release');
      Object.assign(context, { profile, marker, downloadedInstaller: state.downloadedFile });
      await fs.writeFile(contextFile, JSON.stringify(context, null, 2));
      await fs.writeFile(path.join(evidence, 'download.json'), JSON.stringify({ passed: true, fromVersion: version, toVersion: state.downloadedVersion, sha256: downloadedHash, consentMessages: state.messages, transportWarnings: state.errors }, null, 2));
      keepProfile = true;
      console.log(`PASS | actual installed ${version} update menu downloaded and verified ${state.downloadedVersion}`);
    } else {
      assert.equal(version, context.targetVersion);
      const source = await application.evaluate(() => process.mainModule.require('./release.json'));
      assert.equal(source.sourceCommit, context.targetCommit);
      assert.equal(await page.evaluate(() => localStorage.getItem('barberos-update-acceptance')), context.marker);
      await page.screenshot({ path: path.join(evidence, 'updated-home.png'), animations: 'disabled', timeout: 30000 });
      await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({ passed: true, fromVersion: context.fromVersion, toVersion: version, installedSource: source.sourceCommit, profilePreserved: true, checkedAt: new Date().toISOString(), checks: ['real-update-menu', 'release-discovery', 'actual-updater-download', 'published-byte-integrity', 'NSIS-upgrade', 'same-profile-after-upgrade', 'updated-production-runtime'] }, null, 2));
      console.log(`PASS | installed upgrade ${context.fromVersion} → ${version}, source and persistent profile verified`);
    }
  } finally {
    if (application) await application.close();
    if (profile && !keepProfile) await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
