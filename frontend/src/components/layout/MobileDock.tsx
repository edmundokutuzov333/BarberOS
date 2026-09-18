import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MoreHorizontal, LogOut, X } from 'lucide-react';
import { NAV, DOCK } from './nav';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function MobileDock() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const { signOut } = useAuth();

  const dockItems = NAV.filter((n) => DOCK.includes(n.to));
  const rest = NAV.filter((n) => !DOCK.includes(n.to));
  const activeTo = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.to;
  const moreActive = !!activeTo && !DOCK.includes(activeTo);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 350, damping: 30 };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div key="sheet" data-testid="dock-more-sheet"
            initial={{ opacity: 0, y: reduce ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-24 z-40 glass glass-2 p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="t-label text-ink-mid">Mais</span>
              <button data-testid="dock-more-close" onClick={() => setOpen(false)} aria-label="Fechar" className="p-1.5 text-ink-mid hover:text-ink-hi"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {rest.map((item) => {
                const isActive = activeTo === item.to;
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} data-testid={`dock-more-${item.testId}`} onClick={() => setOpen(false)}
                    className={cn('flex items-center gap-3 h-11 rounded-2xl px-3 text-sm transition-colors',
                      isActive ? 'bg-accent-soft text-accent-ink font-medium' : 'text-ink-mid hover:text-ink-hi hover:bg-white/5')}>
                    <item.icon size={17} className={isActive ? '' : 'opacity-55'} />{item.label}
                  </NavLink>
                );
              })}
              <button data-testid="dock-sign-out" onClick={signOut} className="flex items-center gap-3 h-11 rounded-2xl px-3 text-sm text-ink-mid hover:text-ink-hi hover:bg-white/5">
                <LogOut size={17} className="opacity-55" />Sair
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav data-testid="mobile-dock" aria-label="Navegação"
        className="fixed bottom-4 inset-x-4 z-50 h-16 rounded-full bg-[var(--surface-2)] backdrop-blur-2xl border border-white/10 shadow-[0_16px_40px_-10px_rgba(80,40,160,.5)] flex items-center justify-around px-2">
        {dockItems.map((item) => {
          const isActive = activeTo === item.to;
          return (
            <NavLink key={item.to} to={item.to} data-testid={`dock-${item.testId}`} aria-label={item.label} onClick={() => setOpen(false)}
              className={cn('relative flex flex-col items-center justify-center h-12 w-14 rounded-full', isActive ? 'text-accent-ink' : 'text-ink-lo')}>
              {isActive && <motion.div layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} />}
              <item.icon size={20} className={cn('relative', !isActive && 'opacity-55')} />
            </NavLink>
          );
        })}
        <button data-testid="dock-more" aria-label="Mais" onClick={() => setOpen((o) => !o)}
          className={cn('relative flex items-center justify-center h-12 w-14 rounded-full', moreActive ? 'text-accent-ink' : 'text-ink-lo')}>
          {moreActive && <motion.div layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} />}
          <MoreHorizontal size={20} className={cn('relative', !moreActive && 'opacity-55')} />
        </button>
      </nav>
    </>
  );
}
