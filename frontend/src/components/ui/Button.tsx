import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-soft text-accent-ink font-medium shadow-[0_8px_24px_-6px_rgba(var(--accent-rgb),.45)] hover:brightness-105',
  secondary: 'bg-[var(--surface-2)] text-ink-hi border border-white/10 hover:border-white/20',
  ghost: 'text-ink-mid hover:text-ink-hi hover:bg-white/5',
  danger: 'bg-st-noshow/15 text-st-noshow border border-st-noshow/30 hover:bg-st-noshow/25',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-xs', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-base',
};

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: Variant; size?: Size; pill?: boolean; loading?: boolean; full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', pill, loading, full, children, disabled, ...rest }, ref) => {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 select-none transition-[background-color,color,border-color,filter] duration-150',
          'disabled:opacity-50 disabled:pointer-events-none',
          pill ? 'rounded-full' : 'rounded-2xl',
          variants[variant], sizes[size], full && 'w-full', className,
        )}
        {...(rest as HTMLMotionProps<'button'>)}
      >
        {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin opacity-70" aria-hidden />}
        {children as React.ReactNode}
      </motion.button>
    );
  },
);
Button.displayName = 'Button';

export type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
