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
      window.__phase25 = { lcp: 0, cls: 0, inp: 0, lcpElement: '', clsEntries: [] };

      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) { window.__phase25.lcp = last.startTime; window.__phase25.lcpElement = last.element?.outerHTML?.slice(0, 280) || ''; }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) { window.__phase25.cls += entry.value; window.__phase25.clsEntries.push({ value: entry.value, sources: (entry.sources || []).map((source) => ({ tag: source.node?.tagName, id: source.node?.id, className: typeof source.node?.className === 'string' ? source.node.className.slice(0, 100) : '', previousRect: source.previousRect, currentRect: source.currentRect })) }); }
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

    // Wait for a real LCP candidate before any input. Input can end LCP observation,
    // so collecting LCP after a click would produce a false zero.
    await page.waitForFunction(
      () => Boolean(window.__phase25 && window.__phase25.lcp > 0),
      undefined,
      { timeout: 5_000 },
    ).catch(() => {});
    await page.waitForTimeout(250);

    const initialMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const rpc = resources.filter((entry) =>
        entry.name.includes('/rest/v1/rpc/get_public_barbershop')
      );

      return {
        lcp: window.__phase25.lcp,
        lcpElement: window.__phase25.lcpElement,
        lcpEntries: performance.getEntriesByType('largest-contentful-paint').map((entry) => ({
          startTime: entry.startTime,
          size: entry.size,
          element: entry.element?.outerHTML?.slice(0, 280) || '',
        })),
        visibilityState: document.visibilityState,
        cls: window.__phase25.cls,
        clsEntries: window.__phase25.clsEntries,
        elapsed: performance.now(),
        wallClock: Date.now(),
        dcl: navigation?.domContentLoadedEventEnd ?? 0,
        load: navigation?.loadEventEnd ?? 0,
        ttfb: navigation?.responseStart ?? 0,
        rpcDuration: rpc.length ? Math.max(...rpc.map((entry) => entry.duration)) : 0,
        rpcCount: rpc.length,
      };
    });

    // One non-navigational input sample for INP. LCP/CLS above are captured first.
    const safeInteraction = page.locator('main h1').first();
    await expect(safeInteraction).toBeVisible();
    await safeInteraction.click();
    await page.waitForTimeout(300);
    const inp = await page.evaluate(() => window.__phase25.inp);
    const metrics = { ...initialMetrics, inp };

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
