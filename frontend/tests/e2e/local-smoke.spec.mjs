import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const publicRoutes = [
  { path: '/', heading: /Como queres entrar\?/i, label: 'gateway page', atmosphere: true, atmosphereVariant: 'hero' },
  { path: '/sobre', heading: /A barbearia controla o dia/i, label: 'about page', atmosphere: true, atmosphereVariant: 'hero' },
  { path: '/entrar', heading: /^Entrar$/i, label: 'login page', atmosphere: true, atmosphereVariant: 'quiet' },
  { path: '/registar', heading: /^Criar conta$/i, label: 'registration page', atmosphere: true, atmosphereVariant: 'quiet' },
  { path: '/recuperar', heading: /Recuperar palavra-passe/i, label: 'password recovery page', atmosphere: true, atmosphereVariant: 'quiet' },
  { path: '/barbearia/oryon', heading: /^Barbearia Oryon$/i, label: 'public demonstration page', atmosphere: true, atmosphereVariant: 'showcase' },
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
        const atmosphere = page.getByTestId('barber-atmosphere');
        await expect(atmosphere).toHaveCount(1);
        await expect(atmosphere).toHaveAttribute('aria-hidden', 'true');
        await expect(atmosphere).toHaveClass(new RegExp(`barber-atmosphere--${route.atmosphereVariant}`));
        await expect(page.locator('html')).toHaveAttribute(
          'data-barberos-surface',
          route.path === '/' ? 'landing' : 'platform',
        );
        if (route.atmosphereVariant === 'showcase') {
          const showcaseSlats = page.locator('.barber-atmosphere--showcase .barber-atmosphere__slats--static');
          await expect(showcaseSlats).toHaveCount(1);
          await expect(page.locator('.barber-atmosphere--showcase .micro-slats')).toHaveCount(0);
          await expect(showcaseSlats).toHaveCSS('background-image', /repeating-linear-gradient/);
        }
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

  test('public booking wizard inherits the quiet background and loads the service step', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const response = await page.goto('/barbearia/oryon/marcar');
    expect(response?.status(), 'public booking route HTTP status').toBeLessThan(400);
    const atmosphere = page.getByTestId('barber-atmosphere');
    await expect(atmosphere).toHaveCount(1);
    await expect(atmosphere).toHaveClass(/barber-atmosphere--quiet/);
    await expect(page.getByTestId('booking-step-service')).toBeVisible({ timeout: 15_000 });
    expect(pageErrors, 'Uncaught browser errors on public booking route').toEqual([]);
  });

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
