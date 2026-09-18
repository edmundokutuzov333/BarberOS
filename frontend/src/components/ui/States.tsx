import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div data-testid="skeleton" aria-busy className={cn('glass overflow-hidden p-6', className)}>
      <div className="aurora-sweep animate-aurora" />
      <div className="space-y-3 opacity-40">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 rounded-full bg-white/10" style={{ width: `${85 - i * 18}%` }} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action, testId }: { title: string; body?: string; action?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId ?? 'empty-state'} className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
      <p className="t-card text-ink-hi">{title}</p>
      {body && <p className="t-body text-ink-mid mt-1.5 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div data-testid="error-state" role="alert" className="rounded-2xl border border-st-noshow/30 bg-st-noshow/10 p-5 flex items-center justify-between gap-4">
      <p className="t-body text-ink-hi">{message}</p>
      {onRetry && (
        <button data-testid="error-retry-btn" onClick={onRetry} className="t-label text-accent-soft hover:text-ink-hi transition-colors">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Panel({ children, className, title, aside, testId }: { children: ReactNode; className?: string; title?: string; aside?: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className={cn('glass p-5 sm:p-6', className)}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="t-card text-ink-hi">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
