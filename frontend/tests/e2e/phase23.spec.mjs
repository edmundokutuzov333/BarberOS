import { test, expect } from '@playwright/test';

const shopSlug = process.env.BARBEROS_E2E_SHOP_SLUG;

test.describe('BarberOS Phase 23 smoke journey', () => {
  test('landing page is reachable without fatal browser errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText('BarberOS');
    expect(errors).toEqual([]);
  });

  test('login route is reachable', async ({ page }) => {
    const response = await page.goto('/entrar');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText(/Entrar/i);
  });

  test('public shop and booking wizard are navigable in dedicated E2E environment', async ({ page }) => {
    test.skip(!shopSlug, 'BARBEROS_E2E_SHOP_SLUG is required for a dedicated E2E environment.');
    const response = await page.goto('/barbearia/' + shopSlug);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText(/Marcar/i);
    await page.getByRole('link', { name: /Marcar/i }).first().click();
    await expect(page).toHaveURL(new RegExp('/barbearia/' + shopSlug + '/marcar'));
    await expect(page.locator('body')).toContainText(/Serviço/i);
  });

  test('authenticated route redirects to login without a session', async ({ page }) => {
    await page.goto('/app/agenda');
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe('BarberOS Phase 23 authenticated journey', () => {
  test('pre-provisioned E2E account can reach operational surface', async ({ page }) => {
    const email = process.env.BARBEROS_E2E_EMAIL;
    const password = process.env.BARBEROS_E2E_PASSWORD;
    test.skip(!email || !password, 'Dedicated authenticated E2E credentials are not configured.');
    await page.goto('/entrar');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/palavra|password/i).fill(password);
    await page.getByRole('button', { name: /Entrar/i }).click();
    await expect(page).toHaveURL(/\/app(?:\/|$)/);
    await expect(page.locator('body')).toContainText(/Agenda|Início|Definições/i);
  });
});
