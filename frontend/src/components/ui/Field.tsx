import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string; hint?: string; error?: string; prefix?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, hint, error, prefix, className, id, ...rest }, ref) => {
  const inputId = id ?? rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-mid text-sm">{prefix}</span>}
        <input ref={ref} id={inputId} className={cn('field', prefix && 'pl-[4.4rem]', error && 'border-st-noshow/60', className)} {...rest} />
      </div>
      {error ? <span data-testid={`${inputId}-error`} className="t-label text-st-noshow mt-1.5 block">{error}</span>
        : hint ? <span className="t-label text-ink-mid mt-1.5 block">{hint}</span> : null}
    </label>
  );
});
Field.displayName = 'Field';
