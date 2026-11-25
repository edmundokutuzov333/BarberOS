import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Building2, Users, CreditCard, Wallet, LifeBuoy, LineChart, LayoutDashboard, ArrowLeft, LogOut } from 'lucide-react';
import { AnimatedOutlet } from './AppShell';
import { Brand } from '@/components/ui/Brand';
import { cn } from '@/lib/utils';
import { SkipLink } from '@/components/ui/SkipLink';
import { useAuth } from '@/lib/auth';

const ADMIN_NAV = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin/barbearias', label: 'Barbearias', icon: Building2 },
  { to: '/admin/utilizadores', label: 'Utilizadores', icon: Users },
  { to: '/admin/planos', label: 'Planos', icon: CreditCard },
  { to: '/admin/pagamentos', label: 'Pagamentos', icon: Wallet },
  { to: '/admin/suporte', label: 'Suporte', icon: LifeBuoy },
  { to: '/admin/metricas', label: 'Métricas', icon: LineChart },
];

export function AdminShell() {
  const { pathname } = useLocation();
  const { profile, user, signOut } = useAuth();
  const reduce = useReducedMotion();
  const active = ADMIN_NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  return (
    <div className="barber-shell min-h-screen lg:flex lg:gap-6 lg:p-6">
      
      <SkipLink targetId="admin-main-content" />
      <aside
        data-testid="admin-sidebar"
        className="glass glass-2 lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:w-64 shrink-0 flex flex-col m-4 lg:m-0 overflow-hidden"
      >
        <div className="h-16 shrink-0 px-5 flex items-center justify-between border-b border-[var(--border-subtle)]">
          <Brand size="sm" />
          <span className="t-label text-ink-mid rounded-full border border-[var(--border-default)] px-2 py-1">Admin</span>
        </div>

        <nav className="flex-1 min-h-0 px-3 py-3 gap-1 flex lg:flex-col overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto no-scrollbar" aria-label="Navegação de administração">
          {ADMIN_NAV.map((n) => {
            const isActive = active?.to === n.to;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={`admin-nav-${n.to.split('/').pop() || 'home'}`}
                title={n.label}
                className={cn(
                  'relative flex items-center gap-3 min-h-11 rounded-2xl px-3 text-sm shrink-0 transition-[background-color,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent-soft',
                  isActive ? 'text-accent-ink font-medium' : 'text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)]',
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="admin-nav-active"
                    className="absolute inset-0 rounded-2xl bg-accent-soft"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 350, damping: 30 }}
                    aria-hidden
                  />
                )}
                <n.icon size={16} className={cn('relative shrink-0', !isActive && 'opacity-60')} aria-hidden />
                <span className="relative truncate">{n.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 shrink-0 border-t border-[var(--border-subtle)] space-y-2">
          <div className="rounded-2xl bg-white/[0.025] border border-white/5 px-3 py-3">
            <p className="t-label text-ink-lo">Administrador da plataforma</p>
            <p className="text-sm text-ink-hi truncate mt-1">{profile?.full_name || user?.email || 'Admin Oryon'}</p>
            {user?.email && profile?.full_name && <p className="t-label text-ink-lo truncate mt-0.5">{user.email}</p>}
          </div>
          <NavLink
            to="/app"
            data-testid="admin-back-to-app"
            className="flex items-center gap-3 min-h-11 rounded-2xl px-3 text-sm text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)] outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          >
            <ArrowLeft size={16} className="opacity-60" aria-hidden />
            Voltar à barbearia
          </NavLink>
          <button
            type="button"
            data-testid="admin-sign-out"
            onClick={() => void signOut()}
            className="flex items-center gap-3 min-h-11 w-full rounded-2xl px-3 text-sm text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)] outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          >
            <LogOut size={16} className="opacity-60" aria-hidden />
            Terminar sessão
          </button>
        </div>
      </aside>

      <main id="admin-main-content" tabIndex={-1} aria-label="Conteúdo principal da administração" className="flex-1 min-w-0 px-4 pb-10 lg:p-0">
        <AnimatedOutlet />
      </main>
    </div>
  );
}