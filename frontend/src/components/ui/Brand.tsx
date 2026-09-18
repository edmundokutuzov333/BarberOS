import { cn } from '@/lib/utils';

export function Brand({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl sm:text-4xl' }[size];
  return (
    <span data-testid="brand" className={cn('inline-flex items-baseline gap-2 whitespace-nowrap', s, className)}>
      <span className="font-semibold tracking-[-0.01em] text-ink-hi">BarberOS</span>
      <span className="font-light text-ink-mid opacity-70" style={{ fontSize: '0.62em' }}>by Oryon</span>
    </span>
  );
}
