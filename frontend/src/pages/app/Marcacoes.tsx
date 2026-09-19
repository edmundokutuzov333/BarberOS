import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, RefreshCw, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { StatusChip, type ApptStatus } from '@/components/ui/StatusChip';
import { useAppointmentAction, useAgendaAppointments } from '@/features/agenda/api';
import { todayRange, formatMT, humanError, fmt } from '@/lib/utils';
import { useShop } from '@/lib/shop';

type WindowMode = 'next' | 'previous';
type StatusFilter = 'all' | ApptStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'in_progress', label: 'Em atendimento' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'no_show', label: 'Faltas' },
];

function rangeFor(mode: WindowMode) {
  const { from: today } = todayRange();
  const anchor = new Date(today);
  const start = new Date(anchor);
  const end = new Date(anchor);

  if (mode === 'next') {
    end.setUTCDate(end.getUTCDate() + 14);
  } else {
    start.setUTCDate(start.getUTCDate() - 14);
  }

  return { from: start.toISOString(), to: end.toISOString() };
}

function actionLabel(action: 'confirm' | 'cancel') {
  return action === 'confirm' ? 'Confirmar' : 'Cancelar';
}

export default function Marcacoes() {
  const { shop } = useShop();
  const [mode, setMode] = useState<WindowMode>('next');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const range = useMemo(() => rangeFor(mode), [mode]);
  const appointmentsQuery = useAgendaAppointments(shop?.id, range.from, range.to);
  const action = useAppointmentAction();

  const appointments = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-PT');
    return (appointmentsQuery.data ?? [])
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => {
        if (!q) return true;
        return [item.customer_name, item.service_name, item.barber_name]
          .some((value) => String(value ?? '').toLocaleLowerCase('pt-PT').includes(q));
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [appointmentsQuery.data, query, status]);

  const runAction = async (appointmentId: string, next: 'confirm' | 'cancel') => {
    if (!shop) return;
    try {
      await action.mutateAsync({
        shopId: shop.id,
        appointmentId,
        action: next,
        reason: next === 'cancel' ? 'Cancelada pela equipa na gestão de marcações' : null,
      });
      toast.success(next === 'confirm' ? 'Marcação confirmada' : 'Marcação cancelada');
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  return (
    <Page
      testId="marcacoes-page"
      title="Marcações"
      subtitle="Veja, filtre e actualize as marcações sem sair desta área."
      actions={(
        <Button
          data-testid="marcacoes-refresh-btn"
          variant="secondary"
          size="sm"
          pill
          onClick={() => void appointmentsQuery.refetch()}
          disabled={appointmentsQuery.isFetching}
        >
          <RefreshCw size={15} className={appointmentsQuery.isFetching ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      )}
    >
      <div className="space-y-4">
        <Panel testId="marcacoes-filters">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <label className="relative block">
              <span className="sr-only">Pesquisar marcações</span>
              <Search size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mid" />
              <input
                data-testid="marcacoes-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="field pl-11"
                placeholder="Pesquisar cliente, serviço ou barbeiro"
                type="search"
              />
            </label>

            <div className="relative">
              <label htmlFor="marcacoes-window" className="sr-only">Período</label>
              <select
                id="marcacoes-window"
                data-testid="marcacoes-window-select"
                value={mode}
                onChange={(event) => setMode(event.target.value as WindowMode)}
                className="field min-w-44 appearance-none pr-10"
              >
                <option value="next">Próximos 14 dias</option>
                <option value="previous">Últimos 14 dias</option>
              </select>
              <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-mid" />
            </div>

            <div className="relative">
              <label htmlFor="marcacoes-status" className="sr-only">Estado</label>
              <select
                id="marcacoes-status"
                data-testid="marcacoes-status-select"
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="field min-w-44 appearance-none pr-10"
              >
                {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-mid" />
            </div>
          </div>
        </Panel>

        {appointmentsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton testId="marcacoes-loading-1" className="h-28" lines={4} />
            <Skeleton testId="marcacoes-loading-2" className="h-28" lines={4} />
            <Skeleton testId="marcacoes-loading-3" className="h-28" lines={4} />
          </div>
        ) : appointmentsQuery.error ? (
          <ErrorState message={humanError(appointmentsQuery.error)} onRetry={() => appointmentsQuery.refetch()} />
        ) : appointments.length === 0 ? (
          <Panel>
            <EmptyState
              testId="marcacoes-empty"
              title={query || status !== 'all' ? 'Nenhuma marcação corresponde aos filtros' : 'Não há marcações neste período'}
              body={query || status !== 'all' ? 'Experimente limpar a pesquisa ou mudar o estado.' : 'Quando entrar uma marcação, ela aparece aqui automaticamente.'}
              action={(query || status !== 'all') ? (
                <Button
                  data-testid="marcacoes-clear-filters-btn"
                  variant="secondary"
                  size="sm"
                  pill
                  onClick={() => { setQuery(''); setStatus('all'); }}
                >
                  Limpar filtros
                </Button>
              ) : undefined}
            />
          </Panel>
        ) : (
          <Panel testId="marcacoes-list" className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-2)] border-b border-white/10">
                    <th className="px-5 py-4 text-left t-label text-ink-mid font-medium">Cliente</th>
                    <th className="px-5 py-4 text-left t-label text-ink-mid font-medium">Data e hora</th>
                    <th className="px-5 py-4 text-left t-label text-ink-mid font-medium">Serviço</th>
                    <th className="px-5 py-4 text-left t-label text-ink-mid font-medium">Barbeiro</th>
                    <th className="px-5 py-4 text-left t-label text-ink-mid font-medium">Estado</th>
                    <th className="px-5 py-4 text-left t-label text-ink-mid font-medium">Valor</th>
                    <th className="px-5 py-4 text-right t-label text-ink-mid font-medium">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((item) => {
                    const busy = action.isPending && action.variables?.appointmentId === item.appointment_id;
                    return (
                      <tr key={item.appointment_id} data-testid={'marcacao-row-' + item.appointment_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-ink-hi">{item.customer_name}</p>
                          {item.source === 'manual' && <p className="t-label text-ink-mid mt-1">Presencial</p>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-sm text-ink-hi">
                            <CalendarDays size={15} className="text-accent-soft" aria-hidden />
                            {fmt(item.starts_at, "dd/MM/yyyy")}
                          </div>
                          <div className="flex items-center gap-2 t-label text-ink-mid mt-1">
                            <Clock3 size={14} aria-hidden />
                            {fmt(item.starts_at, "HH:mm")} · {item.duration_min} min
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-ink-hi">
                          {item.service_name}
                          <p className="t-label text-ink-mid mt-1">{item.price_cents != null ? formatMT(item.price_cents) : 'Sem preço'}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-ink-mid">{item.barber_name}</td>
                        <td className="px-5 py-4"><StatusChip status={item.status} /></td>
                        <td className="px-5 py-4 text-sm text-ink-hi">{item.price_cents != null ? formatMT(item.price_cents) : '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {item.status === 'pending' && item.deposit_status !== 'awaiting' && (
                              <button
                                data-testid={'marcacao-confirm-' + item.appointment_id}
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(item.appointment_id, 'confirm')}
                                className="min-h-10 rounded-2xl px-3 text-xs text-st-done border border-st-done/25 bg-st-done/10 hover:bg-st-done/15 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                                title="Confirmar marcação"
                              >
                                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} aria-hidden />Confirmar</span>
                              </button>
                            )}
                            {(item.status === 'pending' || item.status === 'confirmed') && (
                              <button
                                data-testid={'marcacao-cancel-' + item.appointment_id}
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(item.appointment_id, 'cancel')}
                                className="min-h-10 rounded-2xl px-3 text-xs text-st-noshow border border-st-noshow/25 bg-st-noshow/10 hover:bg-st-noshow/15 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                                title={actionLabel('cancel') + ' marcação'}
                              >
                                <span className="inline-flex items-center gap-1.5"><XCircle size={14} aria-hidden />Cancelar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <p className="t-label text-ink-mid px-1" role="status" aria-live="polite">
          {appointments.length} {appointments.length === 1 ? 'marcação encontrada' : 'marcações encontradas'}
        </p>
      </div>
    </Page>
  );
}
