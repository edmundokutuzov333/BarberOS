import { cn } from '@/lib/utils';

export type ApptStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: 'Pendente', confirmed: 'Confirmada', in_progress: 'Em atendimento',
  completed: 'Concluída', cancelled: 'Cancelada', no_show: 'Faltou',
};

export const STATUS_VAR: Record<ApptStatus, string> = {
  pending: 'var(--st-pending)', confirmed: 'var(--st-confirmed)', in_progress: 'var(--st-active)',
  completed: 'var(--st-done)', cancelled: 'var(--st-cancelled)', no_show: 'var(--st-noshow)',
};

export function StatusChip({ status, className }: { status: ApptStatus; className?: string }) {
  const c = STATUS_VAR[status];
  return (
    <span
      data-testid={`status-chip-${status}`}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 t-label font-normal border', status === 'in_progress' && 'animate-pulseSlow', className)}
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 30%, transparent)`, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
