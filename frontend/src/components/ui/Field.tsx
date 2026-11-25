import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, hint, error, prefix, className, id, ...rest }, ref) => {
  const generatedId = useId();
  const inputId = id ?? `field-${generatedId.replace(/:/g, '')}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [error ? undefined : hintId, errorId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;

  return (
    <div className="block min-w-0">
      <label className="block" htmlFor={inputId}>
        <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
        <div className={cn(prefix ? "field-prefix-layout" : "relative")}>
          {prefix && (
            <span className="field-prefix text-ink-mid text-sm select-none" aria-hidden="true">
              {prefix}
            </span>
          )}
          <input
            {...rest}
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : rest['aria-invalid']}
            aria-describedby={describedBy}
            aria-errormessage={errorId}
            className={cn(
              'field',
              error && 'border-st-noshow/60 focus:border-st-noshow focus:shadow-[0_0_0_1px_var(--st-noshow),0_0_0_4px_rgba(245,123,157,.11)]',
              className,
            )}
          />
        </div>
      </label>
      {error ? (
        <span
          id={errorId}
          data-testid={errorId}
          role="alert"
          aria-live="polite"
          className="t-label text-st-noshow mt-1.5 block"
        >
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="t-label text-ink-mid mt-1.5 block">
          {hint}
        </span>
      ) : null}
    </div>
  );
});
Field.displayName = 'Field';
