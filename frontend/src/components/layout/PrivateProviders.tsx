import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth';
import { ShopProvider } from '@/lib/shop';

export default function PrivateProviders() {
  return (
    <AuthProvider>
      <ShopProvider>
        <Outlet />
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
