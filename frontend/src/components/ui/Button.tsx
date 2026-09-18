import { forwardRef, type ReactNode } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-soft text-accent-ink font-medium shadow-[var(--shadow-accent)] hover:brightness-105 active:brightness-95',
  secondary: 'bg-[var(--surface-2)] text-ink-hi border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] active:bg-white/[.07]',
  ghost: 'text-ink-mid hover:text-ink-hi hover:bg-[var(--surface-hover)] active:bg-white/[.06]',
  danger: 'bg-st-noshow/15 text-st-noshow border border-st-noshow/30 hover:bg-st-noshow/25 active:bg-st-noshow/30',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-10 h-10 px-3.5 text-xs',
  md: 'min-h-11 h-11 px-5 text-sm',
  lg: 'min-h-12 h-12 px-6 text-base',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: Variant;
  size?: Size;
  pill?: boolean;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', pill, loading, full, children, disabled, ...rest }, ref) => {
    const reduce = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 select-none whitespace-nowrap transition-[background-color,color,border-color,filter,box-shadow,opacity] duration-150',
          'disabled:opacity-50 disabled:pointer-events-none',
          pill ? 'rounded-full' : 'rounded-2xl',
          variants[variant],
          sizes[size],
          full && 'w-full',
          className,
        )}
        {...(rest as HTMLMotionProps<'button'>)}
      >
        {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin opacity-70" aria-hidden />}
        {children as ReactNode}
      </motion.button>
    );
  },
);
Button.displayName = 'Button';