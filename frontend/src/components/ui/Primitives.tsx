import * as Dialog from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { X, ImagePlus, ChevronDown } from 'lucide-react';
import { forwardRef, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { uploadImage, type Bucket } from '@/lib/storage';
import { toast } from 'sonner';

export function Modal({ open, onOpenChange, title, children, testId }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; testId?: string }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content
          data-testid={testId}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            // Controlled modals have no Dialog.Trigger for Radix to restore.
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus();
            }
          }}
          className="!fixed inset-x-4 top-4 bottom-4 z-50 m-auto h-fit w-auto max-w-lg glass glass-2 p-4 sm:p-7 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain touch-pan-y no-scrollbar outline-none"
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <Dialog.Title className="t-title min-w-0 break-words">{title}</Dialog.Title>
            <Dialog.Close
              data-testid="modal-close"
              aria-label="Fechar"
              className="icon-button shrink-0 -mr-1 -mt-1 focus-visible:ring-2 focus-visible:ring-accent-soft"
            >
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Switch({ checked, onCheckedChange, label, testId }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; testId?: string }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-2.5 cursor-pointer select-none">
      <SwitchPrimitive.Root
        data-testid={testId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-checked={checked}
        className="relative h-6 w-10 shrink-0 rounded-full bg-white/10 border border-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=checked]:bg-accent-soft data-[state=checked]:border-transparent"
      >
        <SwitchPrimitive.Thumb className="block h-[18px] w-[18px] rounded-full bg-ink-mid transition-transform translate-x-[3px] data-[state=checked]:translate-x-[19px] data-[state=checked]:bg-accent-ink" />
      </SwitchPrimitive.Root>
      {label && <span className="t-body text-ink-mid">{label}</span>}
    </label>
  );
}

export function Select({ label, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const generatedId = useId();
  const inputId = rest.id ?? `select-${generatedId.replace(/:/g, '')}`;
  return (
    <label className="block min-w-0" htmlFor={inputId}>
      {label && <span className="t-label text-ink-mid mb-1.5 block">{label}</span>}
      <span className="relative block min-w-0">
        <select {...rest} id={inputId} className={cn('field appearance-none cursor-pointer pr-10', className)}>
          {children}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-mid" />
      </span>
    </label>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }>(
  ({ label, className, error, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = rest.id ?? `textarea-${generatedId.replace(/:/g, '')}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [rest['aria-describedby'], errorId].filter(Boolean).join(' ') || undefined;
    return (
      <div className="block min-w-0">
        <label className="block" htmlFor={inputId}>
          <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
        </label>
        <textarea {...rest} ref={ref} id={inputId} aria-invalid={error ? true : rest['aria-invalid']}
          aria-describedby={describedBy} aria-errormessage={errorId}
          className={cn('field min-h-[112px] resize-y', error && 'border-st-noshow/60', className)} />
        {error && <span id={errorId} role="alert" className="t-label text-st-noshow mt-1.5 block">{error}</span>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export function ImageUpload({ bucket, shopId, ratio, value, onChange, label, className, testId, shape = 'card' }: {
  bucket: Bucket; shopId: string; ratio: number; value: string | null; onChange: (url: string) => void; label: string; className?: string; testId?: string; shape?: 'card' | 'circle';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      onChange(await uploadImage(bucket, shopId, f, ratio));
      toast.success('Foto carregada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar a foto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
      <button
        type="button"
        data-testid={testId}
        onClick={() => ref.current?.click()}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={`${value ? 'Trocar' : 'Carregar'} ${label}`}
        className={cn(
          'group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft bg-[var(--surface-3)] border border-dashed border-white/15 hover:border-accent/60 transition-colors grid place-items-center text-ink-mid w-full disabled:cursor-wait disabled:opacity-70',
          shape === 'circle' ? 'rounded-full aspect-square max-w-[120px]' : 'rounded-2xl',
        )}
        style={shape === 'card' ? { aspectRatio: String(ratio) } : undefined}
      >
        {value && <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {busy && <div className="absolute inset-0 aurora-sweep animate-aurora" aria-hidden />}
        <span className={cn(
          'relative flex flex-col items-center gap-1 t-label',
          value && 'absolute inset-x-0 bottom-0 bg-black/65 py-2 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100',
        )}>
          <ImagePlus size={18} aria-hidden />
          {value ? 'Trocar foto' : 'Carregar foto'}
        </span>
      </button>
      <input
        ref={ref}
        data-testid={testId ? `${testId}-file-input` : undefined}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

export function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-10 rounded-full px-3.5 text-xs border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-soft',
        active ? 'bg-accent-soft text-accent-ink border-transparent font-medium' : 'border-white/10 text-ink-mid hover:text-ink-hi hover:border-white/20',
      )}
    >
      {children}
    </button>
  );
}