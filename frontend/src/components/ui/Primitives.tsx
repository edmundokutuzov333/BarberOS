import * as Dialog from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { X, ImagePlus } from 'lucide-react';
import { useRef, useState, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { uploadImage, type Bucket } from '@/lib/storage';
import { toast } from 'sonner';
import { humanError } from '@/lib/utils';

export function Modal({ open, onOpenChange, title, children, testId }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; testId?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content data-testid={testId} className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg glass glass-2 p-6 sm:p-7 max-h-[90vh] overflow-y-auto no-scrollbar focus:outline-none">
          <div className="flex items-start justify-between gap-4 mb-5">
            <Dialog.Title className="t-title">{title}</Dialog.Title>
            <Dialog.Close data-testid="modal-close" aria-label="Fechar" className="p-1.5 -m-1.5 text-ink-mid hover:text-ink-hi transition-colors"><X size={18} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Switch({ checked, onCheckedChange, label, testId }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; testId?: string }) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
      <SwitchPrimitive.Root data-testid={testId} checked={checked} onCheckedChange={onCheckedChange}
        className="relative h-6 w-10 rounded-full bg-white/10 border border-white/10 transition-colors data-[state=checked]:bg-accent-soft data-[state=checked]:border-transparent">
        <SwitchPrimitive.Thumb className="block h-4.5 w-4.5 h-[18px] w-[18px] rounded-full bg-ink-mid transition-transform translate-x-[3px] data-[state=checked]:translate-x-[19px] data-[state=checked]:bg-accent-ink" />
      </SwitchPrimitive.Root>
      {label && <span className="t-body text-ink-mid">{label}</span>}
    </label>
  );
}

export function Select({ label, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="t-label text-ink-mid mb-1.5 block">{label}</span>}
      <select className={cn('field appearance-none cursor-pointer', className)} {...rest}>{children}</select>
    </label>
  );
}

export function Textarea({ label, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
      <textarea className={cn('field min-h-[88px] resize-y', className)} {...rest} />
    </label>
  );
}

export function ImageUpload({ bucket, shopId, ratio, value, onChange, label, className, testId, shape = 'card' }: {
  bucket: Bucket; shopId: string; ratio: number; value: string | null; onChange: (url: string) => void; label: string; className?: string; testId?: string; shape?: 'card' | 'circle';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadImage(bucket, shopId, f, ratio)); toast.success('Foto carregada'); }
    catch (e) { toast.error(humanError(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className={className}>
      <span className="t-label text-ink-mid mb-1.5 block">{label}</span>
      <button type="button" data-testid={testId} onClick={() => ref.current?.click()} disabled={busy}
        className={cn('relative overflow-hidden bg-[var(--surface-3)] border border-dashed border-white/15 hover:border-accent/60 transition-colors grid place-items-center text-ink-mid w-full',
          shape === 'circle' ? 'rounded-full aspect-square max-w-[120px]' : 'rounded-2xl')} style={shape === 'card' ? { aspectRatio: String(ratio) } : undefined}>
        {value && <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {busy && <div className="absolute inset-0 aurora-sweep animate-aurora" />}
        <span className={cn('relative flex flex-col items-center gap-1 t-label', value && 'opacity-0 hover:opacity-100 bg-black/50 absolute inset-0 justify-center transition-opacity')}>
          <ImagePlus size={18} />{value ? 'Trocar foto' : 'Carregar foto'}
        </span>
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

export function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} aria-pressed={active}
      className={cn('rounded-full px-3.5 h-9 text-xs border transition-colors', active ? 'bg-accent-soft text-accent-ink border-transparent font-medium' : 'border-white/10 text-ink-mid hover:text-ink-hi hover:border-white/20')}>
      {children}
    </button>
  );
}
