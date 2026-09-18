import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { RouteAnnouncer } from './components/ui/RouteAnnouncer';
import { ShopProvider } from './lib/shop';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary area="na aplicação">
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <RouteAnnouncer />
          <AuthProvider>
            <ShopProvider>
              <App />
              <Toaster
                theme="dark"
                position="top-center"
                toastOptions={{
                  className: '!bg-[var(--surface-2)] !text-[var(--text-hi)] !border-white/10 !rounded-2xl !backdrop-blur-xl',
                }}
              />
            </ShopProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
