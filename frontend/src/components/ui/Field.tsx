import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, hint, error, prefix, className, id, ...rest }, ref) => {
  const inputId = id ?? rest.name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <label className="block min-w-0" htmlFor={inputId}>
      <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-mid text-sm select-none" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'field',
            prefix && 'pl-[4.4rem]',
            error && 'border-st-noshow/60 focus:border-st-noshow focus:shadow-[0_0_0_1px_var(--st-noshow),0_0_0_4px_rgba(245,123,157,.11)]',
            className,
          )}
          {...rest}
        />
      </div>
      {error ? (
        <span id={errorId} data-testid={errorId} role="alert" className="t-label text-st-noshow mt-1.5 block">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="t-label text-ink-mid mt-1.5 block">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
Field.displayName = 'Field';