import { useDeferredValue, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MessageCircle, Play, RefreshCw, Search, UserX, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { StatusChip, type ApptStatus } from '@/components/ui/StatusChip';
import { Chip } from '@/components/ui/Primitives';
import { useShop } from '@/lib/shop';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { buildWhatsAppLink } from '@/lib/calendar';
import { useAppointmentAction } from '@/features/agenda/api';
import { useAppointments, type AppointmentListStatus, type AppointmentListRow } from '@/features/appointments/api';

const PAGE_SIZE = 50;

const STATUS_FILTERS: { value: AppointmentListStatus | null; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'in_progress', label: 'Em atendimento' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'no_show', label: 'Faltas' },
  { value: 'cancelled', label: 'Canceladas' },
];

function rangeWindow() {
  const now = Date.now();
  return {
    from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function actionAllowed(status: AppointmentListStatus, action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel') {
  if (action === 'confirm') return status === 'pending';
  if (action === 'start') return status === 'confirmed';
  if (action === 'complete') return status === 'in_progress';
  if (action === 'no_show') return status === 'confirmed';
  return status === 'pending' || status === 'confirmed';
}

function sourceLabel(source: AppointmentListRow['source']) {
  return source === 'manual' ? 'Presencial' : source === 'waitlist' ? 'Lista de espera' : 'Online';
}

function actionLabel(action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel') {
  return {
    confirm: 'Confirmar',
    start: 'Iniciar atendimento',
    complete: 'Concluir atendimento',
    no_show: 'Marcar falta',
    cancel: 'Cancelar marcação',
  }[action];
}

export default function Marcacoes() {
  const { shop } = useShop();
  const [status, setStatus] = useState<AppointmentListStatus | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const [windowVersion, setWindowVersion] = useState(0);
  const actionMutation = useAppointmentAction();
  const range = useMemo(() => rangeWindow(), [windowVersion]);

  const query = useAppointments(shop?.id, range.from, range.to, status, deferredSearch, page, PAGE_SIZE);
  const totalCount = Number(query.data?.[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const runAction = async (action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel', appointment: AppointmentListRow) => {
    if (action === 'cancel' && !window.confirm('Cancelar esta marcação?')) return;
    let reason: string | null = null;
    if (action === 'cancel') {
      reason = window.prompt('Motivo do cancelamento (opcional):')?.trim() || null;
      if (reason && reason.length > 500) {
        toast.error('O motivo pode ter no máximo 500 caracteres.');
        return;
      }
    }

    try {
      await actionMutation.mutateAsync({
        shopId: shop!.id,
        appointmentId: appointment.appointment_id,
        action,
        reason,
      });
      toast.success(actionLabel(action) + '.');
      await query.refetch();
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  if (!shop) return null;

  return (
    <Page
      testId="appointments-page"
      title="Marcações"
      subtitle="Consulte, filtre e opere as marcações da sua barbearia."
      actions={
        <Link to="/app/agenda">
          <Button variant="secondary" size="sm" pill><CalendarDays size={15} />Abrir agenda</Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="Resultados" value={query.isLoading ? null : totalCount} />
        <Metric label="Hoje em dia" value={query.isLoading ? null : (query.data ?? []).filter((a) => new Date(a.starts_at).toDateString() === new Date().toDateString()).length} />
        <Metric label="Pendentes" value={query.isLoading ? null : (query.data ?? []).filter((a) => a.status === 'pending').length} />
        <Metric label="Confirmadas" value={query.isLoading ? null : (query.data ?? []).filter((a) => a.status === 'confirmed').length} />
      </div>

      <Panel testId="appointments-controls">
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">Pesquisar marcações</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-lo" aria-hidden />
            <input
              data-testid="appointments-search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              placeholder="Pesquisar cliente, telefone, serviço ou barbeiro"
              className="field !pl-10 w-full"
              inputMode="search"
              autoComplete="off"
            />
          </label>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Filtrar marcações">
            {STATUS_FILTERS.map((filter) => (
              <Chip
                key={filter.label}
                active={status === filter.value}
                onClick={() => { setStatus(filter.value); setPage(0); }}
                testId={'appointments-filter-' + (filter.value ?? 'all')}
              >
                {filter.label}
              </Chip>
            ))}
          </div>
        </div>
      </Panel>

      {query.isLoading ? (
        <div className="space-y-3 mt-4" data-testid="appointments-loading">
          <Skeleton className="h-24" lines={3} />
          <Skeleton className="h-24" lines={3} />
          <Skeleton className="h-24" lines={3} />
        </div>
      ) : query.error ? (
        <div className="mt-4"><ErrorState message={humanError(query.error)} onRetry={() => query.refetch()} /></div>
      ) : query.data?.length ? (
        <div className="space-y-3 mt-4" data-testid="appointments-list">
          {query.data.map((appointment) => (
            <AppointmentRow key={appointment.appointment_id} appointment={appointment} onAction={runAction} busy={actionMutation.isPending} />
          ))}

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="t-label text-ink-mid">Página {page + 1} de {totalPages}</p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" pill disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Página anterior"><ChevronLeft size={16} /></Button>
              <Button variant="ghost" size="sm" pill disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="Página seguinte"><ChevronRight size={16} /></Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            testId="appointments-empty"
            title={search.trim() ? 'Nenhuma marcação encontrada' : 'Ainda não há marcações neste período'}
            body={search.trim() ? 'Experimente outro nome, telefone, serviço ou barbeiro.' : 'As marcações online e presenciais aparecem aqui automaticamente.'}
            action={<Link to="/app/agenda"><Button variant="secondary">Abrir agenda</Button></Link>}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="t-label text-ink-mid">Janela: últimos 30 dias e próximos 60 dias.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWindowVersion((value) => value + 1)}
          aria-label="Actualizar marcações"
        >
          <RefreshCw size={15} />Actualizar
        </Button>
      </div>
    </Page>
  );
}

function AppointmentRow({
  appointment,
  onAction,
  busy,
}: {
  appointment: AppointmentListRow;
  onAction: (action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel', appointment: AppointmentListRow) => void;
  busy: boolean;
}) {
  const actions = (['confirm', 'start', 'complete', 'no_show', 'cancel'] as const).filter((action) => actionAllowed(appointment.status, action));

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[.025] p-4 sm:p-5" data-testid="appointment-row">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={appointment.status as ApptStatus} />
            <span className="t-label text-ink-mid">{sourceLabel(appointment.source)}</span>
            {appointment.deposit_status === 'awaiting' && <span className="t-label text-st-pending">Sinal pendente · {formatMT(appointment.deposit_cents)}</span>}
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="min-w-[10rem]">
              <p className="t-card text-ink-hi">{fmt(appointment.starts_at, 'dd MMM yyyy')}</p>
              <p className="text-2xl font-semibold text-ink-hi mt-0.5 flex items-center gap-2"><Clock3 size={18} className="text-accent-soft" />{fmt(appointment.starts_at, 'HH:mm')}</p>
              <p className="t-label text-ink-mid mt-1">{appointment.duration_min} min</p>
            </div>
            <div className="min-w-0">
              <Link to={'/app/clientes/' + appointment.customer_id} className="t-card text-ink-hi hover:text-accent-soft transition-colors">{appointment.customer_name}</Link>
              <p className="t-body text-ink-mid mt-1">{appointment.service_name}{appointment.haircut_name ? ' · ' + appointment.haircut_name : ''}</p>
              <p className="t-label text-ink-mid mt-1">{appointment.barber_name} · {formatMT(appointment.price_cents)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onAction(action, appointment)}
              className="p-2 rounded-xl text-ink-mid hover:text-ink-hi hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50"
              aria-label={actionLabel(action)}
              title={actionLabel(action)}
            >
              {action === 'confirm' && <CheckCircle2 size={15} />}
              {action === 'start' && <Play size={15} />}
              {action === 'complete' && <CheckCircle2 size={15} />}
              {action === 'no_show' && <UserX size={15} />}
              {action === 'cancel' && <X size={15} />}
            </button>
          ))}
          {appointment.customer_phone && (
            <a
              href={buildWhatsAppLink(appointment.customer_phone, 'Olá ' + appointment.customer_name + ', falamos da sua marcação na ' + shopName(appointment) + '.')}
              target="_blank"
              rel="noreferrer"
              aria-label={'Abrir WhatsApp de ' + appointment.customer_name}
              title="WhatsApp"
              className="p-2 rounded-xl text-accent-soft hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            >
              <MessageCircle size={15} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function shopName(appointment: AppointmentListRow) {
  return 'nossa barbearia';
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="glass p-4">
      <p className="t-label text-ink-mid">{label}</p>
      {value === null ? <Skeleton className="h-7 w-20 mt-2" lines={0} /> : <p className="text-2xl font-semibold text-ink-hi mt-1">{value}</p>}
    </div>
  );
}
