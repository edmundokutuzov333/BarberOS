'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
(async () => {
  const executablePath = process.env.BARBEROS_EXECUTABLE;
  if (!executablePath) throw new Error('BARBEROS_EXECUTABLE must point to the packaged application');
  const output = path.resolve(process.env.BARBEROS_EVIDENCE || 'release/runtime-evidence');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'barberos-native-acceptance-'));
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], timeout: 60000 });
  const failures = [];
  try {
    console.log('CHECK | packaged window creation');
    const page = await app.firstWindow({ timeout: 60000 });
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(60000);
    async function snapshot(name) {
      await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); });
      await page.bringToFront();
      await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled', timeout: 30000 });
    }
    page.on('pageerror', error => failures.push(error.message));
    await page.waitForURL('https://barber-os-orpin.vercel.app/**', { timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 60000 });
    assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process]), ['undefined', 'undefined']);
    const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.webSecurity, true);
    assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: 'clipboard-write' })).state), 'granted');
    assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: 'clipboard-read' })).state), 'denied');
    assert.equal(await page.evaluate(() => window.barberosNative?.apiVersion), 1);
    await app.evaluate(({ BrowserWindow, dialog }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus();
      const original = dialog.showMessageBox;
      dialog.showMessageBox = async () => { dialog.showMessageBox = original; return { response: 1, checkboxChecked: false }; };
    });
    assert.deepEqual(await page.evaluate(() => window.barberosNative.getCurrentPosition()), { ok: false, code: 1 });
    await snapshot('01-home.png');
    console.log('CHECK | renderer isolation and clipboard permissions passed; login rejection');
    await page.goto('https://barber-os-orpin.vercel.app/entrar');
    await page.getByTestId('login-email-input').waitFor();
    await page.getByTestId('login-email-input').fill('native-validation@example.invalid');
    await page.getByTestId('login-password-input').fill('not-a-real-password-2026');
    await page.getByTestId('login-submit-btn').click();
    await page.getByTestId('auth-error').waitFor({ timeout: 30000 });
    await snapshot('02-auth-error.png');
    console.log('CHECK | login rejection passed; live shop and catalog');
    await page.goto('https://barber-os-orpin.vercel.app/barbearia/oryon');
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Marcar agora', exact: true }).waitFor({ timeout: 60000 });
    await snapshot('03-real-shop.png');
    const catalogResponse = page.waitForResponse(response => response.url().includes('/rpc/get_public_shop_catalog') && response.ok(), { timeout: 60000 });
    await page.goto('https://barber-os-orpin.vercel.app/barbearia/oryon/marcar');
    const catalog = await (await catalogResponse).json();
    assert.equal(catalog.enabled, true); assert.ok(catalog.products.length > 0);
    await page.locator('[data-testid^="booking-service-"]:not([disabled])').first().click({ timeout: 60000 });
    // Service/style/barber selection advances through the same public booking workflow.
    while (Number(new URL(page.url()).searchParams.get('step') || '1') < 4) {
      const before = page.url();
      await page.getByTestId('booking-next').click();
      await page.waitForURL(url => url.href !== before);
    }
    const day = page.getByRole('listbox', { name: 'Dias disponíveis' }).getByRole('option').filter({ hasText: /\d+ vagas?/ }).first();
    await day.click({ timeout: 60000 });
    await page.getByRole('listbox', { name: 'Horas disponíveis' }).getByRole('option').first().click({ timeout: 60000 });
    await page.getByTestId('public-shop-product-' + catalog.products[0].id).waitFor({ timeout: 60000 });
    assert.equal(await page.locator('[data-testid^="public-shop-product-"]').count(), catalog.products.length);
    const photo = page.getByTestId('public-shop-product-' + catalog.products[0].id).locator('img').first();
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); });
    await page.bringToFront();
    await photo.scrollIntoViewIfNeeded();
    await photo.waitFor();
    assert.equal(await photo.evaluate(async image => { await Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Product photo decode timeout')), 30000))]); return image.complete && image.naturalWidth > 0; }), true);
    await snapshot('04-booking-real-catalog.png');
    console.log('CHECK | real availability and catalog passed; cold network recovery');
    // Exercise a cold network failure. A warm PWA service worker can legitimately serve its cached shell.
    const network = await page.context().newCDPSession(page);
    await network.send('Network.enable');
    await network.send('Network.setBypassServiceWorker', { bypass: true });
    await page.context().route('https://barber-os-orpin.vercel.app/**', route => route.abort('internetdisconnected'));
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.loadURL('https://barber-os-orpin.vercel.app/').catch(() => {}); });
    await page.getByRole('heading', { name: 'Não foi possível ligar à plataforma.' }).waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => typeof window.barberosNative), 'undefined');
    await snapshot('05-offline.png');
    await page.context().unroute('https://barber-os-orpin.vercel.app/**');
    await page.getByRole('link', { name: 'Tentar novamente' }).click();
    await page.waitForURL('https://barber-os-orpin.vercel.app/**', { timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 60000 });
    await network.send('Network.setBypassServiceWorker', { bypass: false });
    assert.deepEqual(failures, [], 'No renderer exceptions');
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, platform: process.platform, testedAt: new Date().toISOString(), checks: ['packaged-launch', 'production-home', 'sandbox-isolation', 'clipboard-write-without-read', 'native-location-bridge-consent-denial', 'no-bridge-on-offline-file', 'backend-login-rejection', 'real-shop-catalog', 'booking-route', 'offline-recovery'], rendererErrors: failures }, null, 2));
    console.log('PASS | packaged BarberOS production runtime, isolation and offline recovery');
  } catch (error) {
    const page = app.windows()[0];
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 }).catch(() => {}); await fs.writeFile(path.join(output, 'failure.txt'), (await page.locator('body').innerText().catch(() => 'Page unavailable'))); }
    throw error;
  } finally { await app.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
