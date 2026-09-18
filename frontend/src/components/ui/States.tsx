import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div
      data-testid="skeleton"
      aria-busy="true"
      aria-label="A carregar conteúdo"
      role="status"
      className={cn('glass overflow-hidden p-6', className)}
    >
      <div className="aurora-sweep animate-aurora" aria-hidden="true" />
      <div className="space-y-3 opacity-40" aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 rounded-full bg-white/10" style={{ width: `${85 - i * 18}%` }} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action, testId }: { title: string; body?: string; action?: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId ?? 'empty-state'}
      role="status"
      className="rounded-2xl border border-dashed border-white/10 p-8 text-center"
    >
      <p className="t-card text-ink-hi">{title}</p>
      {body && <p className="t-body text-ink-mid mt-1.5 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      data-testid="error-state"
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border border-st-noshow/30 bg-st-noshow/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <p className="t-body text-ink-hi">{message}</p>
      {onRetry && (
        <button
          data-testid="error-retry-btn"
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 rounded-2xl px-3.5 t-label text-accent-soft hover:text-ink-hi hover:bg-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Panel({ children, className, title, aside, testId }: { children: ReactNode; className?: string; title?: string; aside?: ReactNode; testId?: string }) {
  const titleId = useId();

  return (
    <section
      data-testid={testId}
      aria-labelledby={title ? titleId : undefined}
      className={cn('glass p-5 sm:p-6', className)}
    >
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 id={titleId} className="t-card text-ink-hi">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
