import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { RouteAnnouncer } from './components/ui/RouteAnnouncer';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';

const PRELOAD_RECOVERY_KEY = 'barberos.preload-recovery';
const PRELOAD_RECOVERY_WINDOW_MS = 60_000;

type PreloadRecovery = { startedAt: number; attempts: number };

function readPreloadRecovery(): PreloadRecovery | null {
  try {
    const raw = sessionStorage.getItem(PRELOAD_RECOVERY_KEY);
    if (!raw) return null;
    const [startedAtText, attemptsText] = raw.split(':');
    const startedAt = Number(startedAtText);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > PRELOAD_RECOVERY_WINDOW_MS) return null;
    // Older builds stored only a timestamp, which counts as the first attempt.
    const attempts = attemptsText === undefined ? 1 : Number(attemptsText);
    return { startedAt, attempts: Number.isFinite(attempts) ? attempts : 1 };
  } catch {
    return null;
  }
}

function writePreloadRecovery(value: PreloadRecovery): boolean {
  try {
    sessionStorage.setItem(PRELOAD_RECOVERY_KEY, `${value.startedAt}:${value.attempts}`);
    return true;
  } catch {
    // Without persistent state, reloading could create an infinite recovery loop.
    return false;
  }
}

function clearPreloadRecovery(): void {
  try {
    sessionStorage.removeItem(PRELOAD_RECOVERY_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}

async function clearStaleBarberOSAssets(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  }

  if ('caches' in window) {
    const keys = await window.caches.keys().catch(() => []);
    const appCaches = keys.filter((key) => key.startsWith('workbox-') || key === 'shop-media');
    await Promise.all(appCaches.map((key) => window.caches.delete(key).catch(() => false)));
  }
}

// When a deployment replaces hashed route chunks, an older service-worker
// cache can keep requesting assets that no longer exist. Try a normal reload,
// then clear only BarberOS/Workbox caches and retry with a fresh document URL.
window.addEventListener('vite:preloadError', (event) => {
  const recovery = readPreloadRecovery();
  const now = Date.now();

  if (!recovery) {
    if (!writePreloadRecovery({ startedAt: now, attempts: 1 })) return;
    event.preventDefault();
    window.location.reload();
    return;
  }

  if (recovery.attempts < 2) {
    if (!writePreloadRecovery({ startedAt: recovery.startedAt, attempts: 2 })) return;
    event.preventDefault();
    void clearStaleBarberOSAssets().catch(() => {}).finally(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('__barberos_asset_recovery', String(now));
      window.location.replace(url.toString());
    });
    return;
  }

  // Do not suppress a third failure. Let Vite/React receive the real import
  // error instead of allowing a failed lazy module to resolve as undefined.
  clearPreloadRecovery();
});

window.addEventListener('load', () => {
  window.setTimeout(clearPreloadRecovery, PRELOAD_RECOVERY_WINDOW_MS);
}, { once: true });

registerSW({ immediate: true });

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });
const pathname = window.location.pathname;
const publicShopMatch = pathname.match(/^\/barbearia\/([^/]+)\/?$/);
const publicBookingMatch = pathname.match(/^\/barbearia\/([^/]+)\/marcar\/?$/);

if (publicShopMatch) {
  const slug = decodeURIComponent(publicShopMatch[1]);
  void import('./pages/PublicBarbershop').catch(() => {});
  void import('./features/public-shop/api')
    .then(({ getPublicBarbershop }) => qc.prefetchQuery({
      queryKey: ['public-barbershop', slug],
      queryFn: () => getPublicBarbershop(slug),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: false,
    }))
    .catch(() => {});
} else if (publicBookingMatch) {
  void import('./pages/BookingWizard').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary area="na aplicação">
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <RouteAnnouncer />
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
