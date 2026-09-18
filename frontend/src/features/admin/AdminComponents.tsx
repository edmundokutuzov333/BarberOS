import type { ReactNode, ComponentType } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/States';
import { cn } from '@/lib/utils';

export function AdminMetricCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon: ComponentType<{size?: number; className?: string}>;
}) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="t-label text-ink-mid">{label}</p>
        <Icon size={16} className="text-accent-soft" aria-hidden />
      </div>
      <p className="text-2xl sm:text-3xl font-medium text-ink-hi mt-3 tracking-tight tabular-nums">{value}</p>
      {detail && <p className="t-label text-ink-mid mt-1">{detail}</p>}
    </Panel>
  );
}

const SHOP_STATUS: Record<string,string> = { trial:'Teste', active:'Activa', suspended:'Suspensa', cancelled:'Cancelada' };
const PAYMENT_STATUS: Record<string,string> = { pending:'Pendente', paid:'Pago', failed:'Falhou', refunded:'Devolvido' };
const SUPPORT_STATUS: Record<string,string> = { open:'Aberto', in_progress:'Em curso', resolved:'Resolvido', closed:'Fechado' };
const PRIORITY: Record<string,string> = { low:'Baixa', normal:'Normal', high:'Alta', urgent:'Urgente' };

const statusStyles: Record<string, string> = {
  trial: 'border-st-pending/35 bg-st-pending/10 text-st-pending',
  active: 'border-st-done/35 bg-st-done/10 text-st-done',
  suspended: 'border-st-warning/35 bg-st-warning/10 text-st-warning',
  cancelled: 'border-st-cancelled/35 bg-st-cancelled/10 text-ink-mid',
  pending: 'border-st-pending/35 bg-st-pending/10 text-st-pending',
  paid: 'border-st-done/35 bg-st-done/10 text-st-done',
  failed: 'border-st-noshow/35 bg-st-noshow/10 text-st-noshow',
  refunded: 'border-st-active/35 bg-st-active/10 text-st-active',
  open: 'border-st-active/35 bg-st-active/10 text-st-active',
  in_progress: 'border-st-pending/35 bg-st-pending/10 text-st-pending',
  resolved: 'border-st-done/35 bg-st-done/10 text-st-done',
  closed: 'border-st-cancelled/35 bg-st-cancelled/10 text-ink-mid',
  urgent: 'border-st-noshow/45 bg-st-noshow/10 text-st-noshow',
  high: 'border-st-warning/35 bg-st-warning/10 text-st-warning',
  normal: 'border-white/10 bg-white/5 text-ink-mid',
  low: 'border-white/10 bg-white/5 text-ink-lo',
};

export function AdminStatus({ kind, value }: { kind:'shop'|'payment'|'support'|'priority'; value:string }) {
  const label = kind==='shop'
    ? SHOP_STATUS[value]
    : kind==='payment'
      ? PAYMENT_STATUS[value]
      : kind==='support'
        ? SUPPORT_STATUS[value]
        : PRIORITY[value];

  return (
    <span
      data-testid={`admin-status-${kind}-${value}`}
      className={cn('inline-flex items-center rounded-full border px-2.5 py-1 t-label font-medium', statusStyles[value] ?? 'border-white/10 bg-white/5 text-ink-mid')}
    >
      {label ?? value}
    </span>
  );
}

export function Pager({ offset, pageSize, total, onPrev, onNext }: { offset:number; pageSize:number; total:number; onPrev:()=>void; onNext:()=>void }) {
  const current = total === 0 ? 0 : Math.floor(offset/pageSize)+1;
  const pages = total === 0 ? 0 : Math.ceil(total/pageSize);
  return (
    <div className="flex items-center justify-between gap-3 mt-4">
      <p className="t-label text-ink-mid" aria-live="polite">{total ? 'Página ' + current + ' de ' + pages : 'Sem registos'}</p>
      <div className="flex items-center gap-2">
        <Button data-testid="admin-page-prev" variant="secondary" size="sm" aria-label="Página anterior" onClick={onPrev} disabled={offset===0}><ChevronLeft size={14} aria-hidden /></Button>
        <Button data-testid="admin-page-next" variant="secondary" size="sm" aria-label="Página seguinte" onClick={onNext} disabled={offset+pageSize>=total}><ChevronRight size={14} aria-hidden /></Button>
      </div>
    </div>
  );
}

export function SearchToolbar({ children }: { children: ReactNode }) {
  return <Panel className="p-3 mb-4"><div className="flex flex-col lg:flex-row gap-2 items-stretch lg:items-center">{children}</div></Panel>;
}

export function FeatureToggle({ label, checked, onChange, testId }: { label:string; checked:boolean; onChange:(value:boolean)=>void; testId?:string }) {
  const id = testId ?? 'feature-toggle-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 cursor-pointer min-h-12">
      <span className="text-sm text-ink-hi">{label}</span>
      <input id={id} data-testid={id} type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="h-5 w-5 accent-[var(--accent)] focus-visible:ring-2 focus-visible:ring-accent-soft" />
    </label>
  );
}