import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const ease = [0.22, 1, 0.36, 1] as const;

export function Page({ children, className, title, subtitle, actions, testId }: {
  children: ReactNode; className?: string; title?: string; subtitle?: string; actions?: ReactNode; testId?: string;
}) {
  const reduce = useReducedMotion();
  const v = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 8, filter: 'blur(6px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -6, filter: 'blur(4px)' },
      };
  return (
    <motion.div data-testid={testId} {...v} transition={{ duration: 0.28, ease }} className={cn('w-full', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            {title && <h1 className="t-title text-ink-hi">{title}</h1>}
            {subtitle && <p className="t-body text-ink-mid mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </motion.div>
  );
}
