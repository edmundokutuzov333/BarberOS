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

// A deployment can leave one browser tab with an older manifest while a new
// lazy route chunk is already live. Recover once automatically instead of
// surfacing the global error screen for a transient preload mismatch.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'barberos.preload-recovery';
  const previous = Number(sessionStorage.getItem(key) ?? 0);
  if (previous && Date.now() - previous < 30_000) return;
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
});
window.addEventListener('load', () => window.setTimeout(() => sessionStorage.removeItem('barberos.preload-recovery'), 30_000), { once: true });

registerSW({ immediate: true });

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });
const pathname = window.location.pathname;
const publicShopMatch = pathname.match(/^\/barbearia\/([^/]+)\/?$/);
const publicBookingMatch = pathname.match(/^\/barbearia\/([^/]+)\/marcar\/?$/);

if (publicShopMatch) {
  const slug = decodeURIComponent(publicShopMatch[1]);
  void import('./pages/PublicBarbershop');
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
  void import('./pages/BookingWizard');
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
