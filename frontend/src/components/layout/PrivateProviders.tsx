import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ShopProvider, useShop } from '@/lib/shop';

// New QueryClient per authenticated authorization scope. An old response can
// only populate its original client, never a different user's workspace.
function ScopedWorkspace() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
  }));
  return <QueryClientProvider client={client}><Outlet /></QueryClientProvider>;
}

function WorkspaceBoundary() {
  const { user, profile, error, loading } = useAuth();
  const { shop, role, error: shopError, loading: shopLoading } = useShop();
  const key = JSON.stringify([user?.id ?? null, profile?.is_platform_admin ?? null,
    profile?.password_change_required ?? null, shop?.id ?? null, role, shop?.status ?? null,
    Boolean(error || shopError), loading || shopLoading]);
  return <ScopedWorkspace key={key} />;
}

export default function PrivateProviders() {
  return (
    <AuthProvider>
      <ShopProvider>
        <WorkspaceBoundary />
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            className: '!bg-[var(--surface-2)] !text-[var(--text-hi)] !border-white/10 !rounded-2xl !backdrop-blur-xl',
          }}
        />
      </ShopProvider>
    </AuthProvider>
  );
}
