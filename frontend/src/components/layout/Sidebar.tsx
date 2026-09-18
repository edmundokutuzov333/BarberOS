import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, LogOut, ChevronsUpDown } from 'lucide-react';
import { NAV } from './nav';
import { Brand } from '@/components/ui/Brand';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const KEY = 'barberos.sidebar';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(KEY) === '1');
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const { signOut, profile } = useAuth();
  const { shop, shops, setShopId, role } = useShop();

  const visibleNav = NAV.filter((item) => !item.permission || can(role, item.permission));
  const active = visibleNav.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  const toggle = () => { localStorage.setItem(KEY, collapsed ? '0' : '1'); setCollapsed(!collapsed); };

  return (
    <motion.aside
      data-testid="sidebar"
      animate={{ width: collapsed ? 76 : 264 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 25 }}
      className="glass sticky top-6 h-[calc(100vh-3rem)] shrink-0 flex flex-col overflow-hidden"
    >
      <div className={cn('flex items-center h-16 px-4 shrink-0', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && <Brand size="sm" />}
        <button data-testid="sidebar-toggle" type="button" onClick={toggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!collapsed}
          className="icon-button h-11 w-11 min-h-11 min-w-11 text-ink-lo hover:text-accent-soft opacity-60 hover:opacity-100">
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      {shop && (
        <div className="px-3 pb-3 shrink-0">
          <div className="relative">
            <select
              data-testid="shop-switcher"
              value={shop.id}
              onChange={(e) => setShopId(e.target.value)}
              aria-label="Barbearia"
              className={cn('field appearance-none cursor-pointer !py-2.5 text-sm font-normal truncate', collapsed && 'opacity-0 pointer-events-none absolute')}
            >
              {shops.map((m) => <option key={m.barbershops.id} value={m.barbershops.id}>{m.barbershops.name}</option>)}
            </select>
            {collapsed
              ? <div className="h-10 w-10 mx-auto rounded-2xl bg-[var(--surface-3)] border border-white/10 grid place-items-center text-sm font-medium">{shop.name.slice(0, 1)}</div>
              : shops.length > 1 && <ChevronsUpDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-lo pointer-events-none" />}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto no-scrollbar px-3 space-y-1" aria-label="Navegação principal">
        {visibleNav.map((item) => {
          const isActive = active?.to === item.to;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} data-testid={item.testId} title={collapsed ? item.label : undefined}
              className={cn('group relative flex items-center gap-3 h-11 rounded-2xl px-3 transition-colors duration-150',
                isActive ? 'text-accent-ink' : 'text-ink-mid hover:text-ink-hi', collapsed && 'justify-center px-0')}>
              {isActive && (
                <motion.div layoutId="nav-active" className="absolute inset-0 rounded-2xl bg-accent-soft"
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 350, damping: 30 }} />
              )}
              <item.icon size={18} aria-hidden="true" className={cn('relative shrink-0 transition-[opacity,color] duration-150',
                isActive ? 'opacity-100' : 'opacity-55 text-ink-lo group-hover:opacity-100 group-hover:text-accent-soft')} />
              {!collapsed && <span className={cn('relative text-sm truncate', isActive ? 'font-medium' : 'font-light')}>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 shrink-0 border-t border-white/5">
        <button data-testid="sign-out-btn" type="button" onClick={signOut} aria-label={collapsed ? 'Sair da conta' : undefined}
          className={cn('flex items-center gap-3 h-11 w-full rounded-2xl px-3 text-ink-mid hover:text-ink-hi hover:bg-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-soft', collapsed && 'justify-center px-0')}>
          <LogOut size={18} className="opacity-55 shrink-0" />
          {!collapsed && <span className="text-sm truncate text-left flex-1">{profile?.full_name ?? 'Sair'}</span>}
        </button>
      </div>
    </motion.aside>
  );
}
