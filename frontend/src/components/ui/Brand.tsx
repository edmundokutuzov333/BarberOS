import { Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Brand({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl sm:text-4xl' }[size];
  return (
    <span data-testid="brand" className={cn('inline-flex items-center gap-2.5 whitespace-nowrap', s, className)}>
      <span className="brand-mark" aria-hidden="true"><Scissors size={size === 'lg' ? 20 : 16} strokeWidth={1.7} /></span>
      <span className="inline-flex items-baseline gap-2">
        <span className="font-semibold tracking-[-0.035em] text-ink-hi">BarberOS</span>
        <span className="font-light text-ink-mid opacity-75" style={{ fontSize: '0.62em' }}>by Oryon</span>
      </span>
    </span>
  );
}
