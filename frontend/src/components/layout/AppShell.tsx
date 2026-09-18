import { Navigate, Outlet, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import { Sidebar } from './Sidebar';
import { MobileDock } from './MobileDock';
import { Skeleton } from '@/components/ui/States';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SkipLink } from '@/components/ui/SkipLink';

function FullSkeleton() {
  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto space-y-4" data-testid="app-loading">
      <Skeleton className="h-16" lines={1} />
      <Skeleton className="h-64" />
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullSkeleton />;
  if (!user) return <Navigate to="/entrar" state={{ from: loc.pathname }} replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { profile, loading } = useAuth();
  if (loading) return <FullSkeleton />;
  if (!profile?.is_platform_admin) return <Navigate to="/app" replace />;
  return <Outlet />;
}

export function AnimatedOutlet() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  return <AnimatePresence mode="wait" initial={false}><div key={pathname}>{outlet}</div></AnimatePresence>;
}

export function AppShell() {
  const { shop, loading } = useShop();
  const { pathname } = useLocation();
  const desktop = useMediaQuery('(min-width: 768px)');

  if (loading) return <FullSkeleton />;
  if (!shop && pathname !== '/app/onboarding') return <Navigate to="/app/onboarding" replace />;
  if (pathname === '/app/onboarding') return <div className="min-h-screen" id="main-content"><SkipLink /><AnimatedOutlet /></div>;

  return (
    <div className="min-h-screen md:flex md:gap-6 md:p-6 md:pr-8">
      <SkipLink />
      {desktop && <Sidebar />}
      <main id="main-content" tabIndex={-1} aria-label="Conteúdo principal" className="flex-1 min-w-0 px-4 pt-5 pb-28 md:p-0 max-w-[1400px]">
        <AnimatedOutlet />
      </main>
      {!desktop && <MobileDock />}
    </div>
  );
}
