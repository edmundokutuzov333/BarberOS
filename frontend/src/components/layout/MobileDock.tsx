import { useEffect, useRef, useState } from 'react';
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
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);

  const dockItems = NAV.filter((n) => DOCK.includes(n.to));
  const rest = NAV.filter((n) => !DOCK.includes(n.to));
  const activeTo = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.to;
  const moreActive = !!activeTo && !DOCK.includes(activeTo);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 350, damping: 30 };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) moreRef.current?.focus();
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="sheet"
            id="dock-more-sheet"
            data-testid="dock-more-sheet"
            initial={{ opacity: 0, y: reduce ? 0 : 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 safe-dock-sheet z-40 glass glass-2 p-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dock-more-title"
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <span id="dock-more-title" className="t-label text-ink-mid">Mais</span>
              <button
                ref={closeRef}
                data-testid="dock-more-close"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar mais opções"
                className="icon-button h-10 w-10 min-h-10 min-w-10"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {rest.map((item) => {
                const isActive = activeTo === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    data-testid={'dock-more-' + item.testId}
                    onClick={() => setOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 min-h-11 rounded-2xl px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-soft',
                      isActive ? 'bg-accent-soft text-accent-ink font-medium' : 'text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)]',
                    )}
                  >
                    <item.icon size={17} className={isActive ? '' : 'opacity-60'} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
              <button data-testid="dock-sign-out" type="button" onClick={signOut} aria-label="Sair da conta" className="flex items-center gap-3 min-h-11 rounded-2xl px-3 text-sm text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)] outline-none focus-visible:ring-2 focus-visible:ring-accent-soft">
                <LogOut size={17} className="opacity-60" aria-hidden="true" />
                Sair
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        data-testid="mobile-dock"
        aria-label="Navegação principal"
        className="fixed safe-dock inset-x-4 z-50 min-h-16 rounded-full bg-[var(--surface-2)] backdrop-blur-2xl border border-[var(--border-default)] shadow-[var(--shadow-float)] flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {dockItems.map((item) => {
          const isActive = activeTo === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={'dock-' + item.testId}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={cn('relative flex items-center justify-center h-12 w-14 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-soft', isActive ? 'text-accent-ink' : 'text-ink-lo')}
            >
              {isActive && <motion.div layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} aria-hidden="true" />}
              <item.icon size={20} className={cn('relative', !isActive && 'opacity-60')} aria-hidden="true" />
            </NavLink>
          );
        })}
        <button
          ref={moreRef}
          data-testid="dock-more"
          type="button"
          aria-label="Mais"
          aria-controls="dock-more-sheet"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn('relative flex items-center justify-center h-12 w-14 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-soft', moreActive ? 'text-accent-ink' : 'text-ink-lo')}
        >
          {moreActive && <motion.div layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} aria-hidden="true" />}
          <MoreHorizontal size={20} className={cn('relative', !moreActive && 'opacity-60')} aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
