import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { RouteAnnouncer } from './components/ui/RouteAnnouncer';
import './index.css';

const pathname = window.location.pathname;
if (pathname.startsWith('/barbearia/')) {
  void import('./pages/PublicBarbershop');
}
if (pathname.startsWith('/barbearia/') && pathname.endsWith('/marcar')) {
  void import('./pages/BookingWizard');
}

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });

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
