import { test, expect } from '@playwright/test';

const slug = process.env.BARBEROS_E2E_SHOP_SLUG || 'oryon';
const FAST_3G = {
  offline: false,
  latency: 150,
  downloadThroughput: Math.floor(1.6 * 1024 * 1024 / 8),
  uploadThroughput: Math.floor(750 * 1024 / 8),
  connectionType: 'cellular3g',
};

test.describe('BarberOS Phase 25 public performance', () => {
  test('public shop stays within Core Web Vitals budget on Fast 3G', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Performance harness uses Chromium CDP network throttling.');

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Network.emulateNetworkConditions', FAST_3G);

    await page.addInitScript(() => {
      window.__phase25 = { lcp: 0, cls: 0, inp: 0 };

      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) window.__phase25.lcp = last.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__phase25.cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {}

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.interactionId && entry.duration > window.__phase25.inp) {
              window.__phase25.inp = entry.duration;
            }
          }
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      } catch {}
    });

    const start = Date.now();
    await page.goto('/barbearia/' + encodeURIComponent(slug), {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Serviços').first()).toBeVisible();
    await page.waitForTimeout(1200);

    await page.mouse.click(400, 220);
    await page.waitForTimeout(300);

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const rpc = resources.filter((entry) =>
        entry.name.includes('/rest/v1/rpc/get_public_barbershop')
      );

      return {
        lcp: window.__phase25.lcp,
        cls: window.__phase25.cls,
        inp: window.__phase25.inp,
        elapsed: performance.now(),
        wallClock: Date.now(),
        dcl: navigation?.domContentLoadedEventEnd ?? 0,
        load: navigation?.loadEventEnd ?? 0,
        ttfb: navigation?.responseStart ?? 0,
        rpcDuration: rpc.length ? Math.max(...rpc.map((entry) => entry.duration)) : 0,
        rpcCount: rpc.length,
      };
    });

    const wallClockMs = Date.now() - start;
    const report = {
      slug,
      browser: browserName,
      wallClockMs,
      ...metrics,
    };

    console.log('PHASE25_PERF ' + JSON.stringify(report));

    expect(metrics.lcp, 'LCP must be measurable').toBeGreaterThan(0);
    expect(metrics.lcp, 'LCP target: <= 2500ms on Fast 3G').toBeLessThanOrEqual(2500);
    expect(metrics.cls, 'CLS target: <= 0.10').toBeLessThanOrEqual(0.10);
    expect(metrics.dcl, 'DOMContentLoaded target: <= 1800ms').toBeLessThanOrEqual(1800);

    if (metrics.rpcDuration > 0) {
      expect(metrics.rpcDuration, 'Public RPC client roundtrip target: <= 1200ms').toBeLessThanOrEqual(1200);
    }

    if (metrics.inp > 0) {
      expect(metrics.inp, 'INP target: <= 200ms').toBeLessThanOrEqual(200);
    }
  });
});
