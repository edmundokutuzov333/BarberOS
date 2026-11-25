import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { MoreHorizontal, LogOut, X, ShieldCheck } from 'lucide-react';
import { navForRole, DOCK } from './nav';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import { cn } from '@/lib/utils';

export function MobileDock() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const { signOut, profile } = useAuth();
  const { role, shop, shops, setShopId } = useShop();
  const shopSchemaAvailable = typeof (shop as unknown as { shop_enabled?: unknown } | null)?.shop_enabled === 'boolean';
  const navItems = navForRole(role).filter((item) => shopSchemaAvailable || !item.to.startsWith('/app/loja'));
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dockItems = navItems.filter(n => DOCK.includes(n.to));
  const rest = navItems.filter(n => !DOCK.includes(n.to));
  const activeTo = navItems.find(n => n.end ? pathname === n.to : pathname.startsWith(n.to))?.to;
  const moreActive = !!activeTo && !DOCK.includes(activeTo);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 350, damping: 30 };
  const linkClass = 'flex items-center gap-2 min-h-11 min-w-0 rounded-2xl px-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-soft';
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content data-testid="dock-more-sheet"
          className="!fixed inset-x-4 safe-dock-sheet z-[61] glass glass-2 p-3 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain outline-none"
          aria-describedby={undefined}
          onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus(); }}>
          <div className="flex items-center justify-between px-2 pb-2">
            <Dialog.Title className="t-card text-ink-hi">Mais opções</Dialog.Title>
            <Dialog.Close asChild>
              <button ref={closeRef} data-testid="dock-more-close" type="button" aria-label="Fechar mais opções"
                className="icon-button focus-visible:ring-2 focus-visible:ring-accent-soft">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {shop && shops.length > 1 && <label className="block min-w-0 px-2 pb-3">
            <span className="t-label text-ink-mid block mb-1.5">Barbearia</span>
            <select className="field" value={shop.id} onChange={event => { setShopId(event.target.value); setOpen(false); }}>
              {shops.map(m => <option key={m.barbershops.id} value={m.barbershops.id}>{m.barbershops.name}</option>)}
            </select>
          </label>}
          <div className="grid grid-cols-2 gap-1">
            {rest.map(item => {
              const isActive = activeTo === item.to;
              return <NavLink key={item.to} to={item.to} end={item.end} data-testid={'dock-more-' + item.testId}
                onClick={() => setOpen(false)} aria-current={isActive ? 'page' : undefined}
                className={cn(linkClass, isActive ? 'bg-accent-soft text-accent-ink font-medium' : 'text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)]')}>
                <item.icon size={17} className={cn('shrink-0', !isActive && 'opacity-60')} aria-hidden="true" />
                <span className="min-w-0 break-words">{item.label}</span>
              </NavLink>;
            })}
            {profile?.is_platform_admin === true && <NavLink to="/admin" onClick={() => setOpen(false)}
              className={cn(linkClass, 'text-ink-mid hover:text-ink-hi')}>
              <ShieldCheck size={17} className="shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">Administração</span>
            </NavLink>}
            <button data-testid="dock-sign-out" type="button" onClick={() => void signOut()} aria-label="Sair da conta"
              className={cn(linkClass, 'text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)]')}>
              <LogOut size={17} className="opacity-60 shrink-0" aria-hidden="true" /> Sair
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      <nav data-testid="mobile-dock" aria-label="Navegação principal"
        className="fixed safe-dock inset-x-4 z-50 min-h-16 rounded-full bg-[var(--surface-2)] backdrop-blur-2xl border border-[var(--border-default)] shadow-[var(--shadow-float)] flex items-center justify-around px-2">
        {dockItems.map(item => {
          const isActive = activeTo === item.to;
          return <NavLink key={item.to} to={item.to} data-testid={'dock-' + item.testId} aria-label={item.label}
            aria-current={isActive ? 'page' : undefined} onClick={() => setOpen(false)}
            className={cn('relative flex items-center justify-center h-12 w-14 max-w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-soft', isActive ? 'text-accent-ink' : 'text-ink-lo')}>
            {isActive && <motion.div layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} aria-hidden="true" />}
            <item.icon size={20} className={cn('relative', !isActive && 'opacity-60')} aria-hidden="true" />
          </NavLink>;
        })}
        <Dialog.Trigger asChild>
          <button data-testid="dock-more" type="button" aria-label="Mais"
            className={cn('relative flex items-center justify-center h-12 w-14 max-w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-soft', moreActive ? 'text-accent-ink' : 'text-ink-lo')}>
            {moreActive && <motion.div layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} aria-hidden="true" />}
            <MoreHorizontal size={20} className="relative" aria-hidden="true" />
          </button>
        </Dialog.Trigger>
      </nav>
    </Dialog.Root>
  );
}
