import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes = [
  { path: '/', heading: /A barbearia controla o dia/i, label: 'landing page', atmosphere: true },
  { path: '/entrar', heading: /^Entrar$/i, label: 'login page', atmosphere: true },
  { path: '/recuperar', heading: /Recuperar palavra-passe/i, label: 'password recovery page', atmosphere: true },
  { path: '/barbearia/oryon', heading: /^Barbearia Oryon$/i, label: 'public demonstration page', atmosphere: true },
];

test.describe('BarberOS local production-safe smoke tests', () => {
  for (const route of publicRoutes) {
    test(`${route.label} renders without uncaught runtime errors`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} HTTP status`).toBeLessThan(400);
      await expect(page.locator('h1:visible').first()).toBeVisible();
      await expect(page.locator('h1:visible').first()).toContainText(route.heading);
      if (route.atmosphere) {
        await expect(page.getByTestId('barber-atmosphere')).toHaveCount(1);
        await expect(page.getByTestId('barber-atmosphere')).toHaveAttribute('aria-hidden', 'true');
      }
      expect(pageErrors, `Uncaught browser errors on ${route.path}`).toEqual([]);
    });

    test(`${route.label} has no serious or critical WCAG 2.1 A/AA violations`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator('h1:visible').first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact));
      expect(
        blocking.map(({ id, help, impact, nodes }) => ({ id, help, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })),
        `Serious or critical accessibility violations on ${route.path}`,
      ).toEqual([]);
    });
  }

  test('private agenda redirects an unauthenticated visitor to login', async ({ page }) => {
    await page.goto('/app/agenda');
    await expect(page).toHaveURL(/\/entrar(?:\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^Entrar$/i })).toBeVisible();
  });

  test('login remains usable on a narrow mobile viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The narrow viewport assertion runs in the mobile Chrome project.');
    await page.goto('/entrar');
    await expect(page.getByRole('heading', { name: /^Entrar$/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/palavra-passe/i)).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(horizontalOverflow, 'The login page must not overflow horizontally on mobile.').toBe(false);
  });
});
