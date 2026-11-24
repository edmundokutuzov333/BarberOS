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
    const page = await app.firstWindow();
    page.on('pageerror', error => failures.push(error.message));
    await page.waitForURL('https://barber-os-orpin.vercel.app/**', { timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 60000 });
    assert.deepEqual(await page.evaluate(() => [typeof window.require, typeof window.process]), ['undefined', 'undefined']);
    const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.webSecurity, true);
    await page.screenshot({ path: path.join(output, '01-home.png'), fullPage: true });
    await page.goto('https://barber-os-orpin.vercel.app/entrar');
    await page.getByTestId('login-email-input').waitFor();
    await page.getByTestId('login-email-input').fill('native-validation@example.invalid');
    await page.getByTestId('login-password-input').fill('not-a-real-password-2026');
    await page.getByTestId('login-submit-btn').click();
    await page.getByTestId('auth-error').waitFor({ timeout: 30000 });
    await page.screenshot({ path: path.join(output, '02-auth-error.png'), fullPage: true });
    await page.goto('https://barber-os-orpin.vercel.app/barbearia/oryon');
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Marcar agora', exact: true }).waitFor({ timeout: 60000 });
    await page.screenshot({ path: path.join(output, '03-real-shop.png'), fullPage: true });
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
    await photo.waitFor();
    assert.equal(await photo.evaluate(async image => { await image.decode(); return image.complete && image.naturalWidth > 0; }), true);
    await page.screenshot({ path: path.join(output, '04-booking-real-catalog.png'), fullPage: true });
    // Exercise a cold network failure. A warm PWA service worker can legitimately serve its cached shell.
    const network = await page.context().newCDPSession(page);
    await network.send('Network.enable');
    await network.send('Network.setBypassServiceWorker', { bypass: true });
    await page.context().route('https://barber-os-orpin.vercel.app/**', route => route.abort('internetdisconnected'));
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.loadURL('https://barber-os-orpin.vercel.app/').catch(() => {}); });
    await page.getByRole('heading', { name: 'Não foi possível ligar à plataforma.' }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: path.join(output, '05-offline.png'), fullPage: true });
    await page.context().unroute('https://barber-os-orpin.vercel.app/**');
    await page.getByRole('link', { name: 'Tentar novamente' }).click();
    await page.waitForURL('https://barber-os-orpin.vercel.app/**', { timeout: 60000 });
    await page.locator('h1').first().waitFor({ timeout: 60000 });
    await network.send('Network.setBypassServiceWorker', { bypass: false });
    assert.deepEqual(failures, [], 'No renderer exceptions');
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, platform: process.platform, testedAt: new Date().toISOString(), checks: ['packaged-launch', 'production-home', 'sandbox-isolation', 'backend-login-rejection', 'real-shop-catalog', 'booking-route', 'offline-recovery'], rendererErrors: failures }, null, 2));
    console.log('PASS | packaged BarberOS production runtime, isolation and offline recovery');
  } catch (error) {
    const page = app.windows()[0];
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 }).catch(() => {}); await fs.writeFile(path.join(output, 'failure.txt'), (await page.locator('body').innerText().catch(() => 'Page unavailable'))); }
    throw error;
  } finally { await app.close(); await fs.rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
