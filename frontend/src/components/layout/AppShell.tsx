import { Navigate, Outlet, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import { Sidebar } from './Sidebar';
import { MobileDock } from './MobileDock';
import { Skeleton } from '@/components/ui/States';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SkipLink } from '@/components/ui/SkipLink';
import { canAccessAppRoute } from '@/lib/permissions';
import { humanError } from '@/lib/utils';
import { ErrorState } from '@/components/ui/States';

function FullSkeleton() {
  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto space-y-4" data-testid="app-loading">
      <Skeleton className="h-16" lines={1} />
      <Skeleton className="h-64" />
    </div>
  );
}

function RoleDenied({ pathname }: { pathname: string }) {
  return (
    <div className="min-h-screen p-6 grid place-items-center" data-testid="role-access-denied">
      <section className="glass w-full max-w-xl rounded-3xl p-6 sm:p-8" aria-labelledby="role-denied-title">
        <p className="t-label text-ink-mid">Acesso restrito</p>
        <h1 id="role-denied-title" className="text-2xl font-semibold text-ink-hi mt-2">
          Esta área não faz parte do seu nível de acesso.
        </h1>
        <p className="t-body text-ink-mid mt-3">
          A sua função nesta barbearia determina quais ferramentas pode consultar ou alterar.
          O endereço solicitado não está disponível para a sua função.
        </p>
        <p className="t-label text-ink-lo mt-3 break-all">{pathname}</p>
        <div className="mt-5">
          <a href="/app" className="inline-flex min-h-11 items-center rounded-2xl bg-accent-soft px-4 text-sm font-medium text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft">
            Ir para o início
          </a>
        </div>
      </section>
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
  const { shop, role, loading, error } = useShop();
  const { pathname } = useLocation();
  const desktop = useMediaQuery('(min-width: 768px)');

  if (loading) return <FullSkeleton />;
  if (error) return <div className="min-h-screen p-6 grid place-items-center"><div className="w-full max-w-xl"><ErrorState message={humanError(error)} onRetry={() => window.location.reload()} /></div></div>;
  if (!shop && pathname !== '/app/onboarding') return <Navigate to="/app/onboarding" replace />;
  if (pathname === '/app/onboarding') {
    if (shop && !(role === 'owner' || role === 'manager')) return <RoleDenied pathname={pathname} />;
    return <div className="min-h-screen" id="main-content"><SkipLink /><AnimatedOutlet /></div>;
  }

  if (!canAccessAppRoute(role, pathname)) {
    return <RoleDenied pathname={pathname} />;
  }

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
