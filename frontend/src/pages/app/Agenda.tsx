import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, MessageCircle, Move, Play, RefreshCw, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { StatusChip, type ApptStatus } from '@/components/ui/StatusChip';
import { buildWhatsAppLink } from '@/lib/calendar';
import { formatMT, humanError } from '@/lib/utils';
import { useShop } from '@/lib/shop';
import { useAvailableSlots } from '@/features/availability/api';
import {
  useAgendaAppointments,
  useAgendaSchedule,
  useAppointmentAction,
  useOperatorReschedule,
  type AgendaAppointment,
  type AgendaSchedule,
} from '@/features/agenda/api';
import { TZDate } from '@date-fns/tz';

type ViewMode = 'day' | 'week';

const PX_PER_MINUTE = 1.7;
const GRID_STEP = 30;

function todayISO(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day;
}

function addDays(iso: string, amount: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(iso: string): string {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return addDays(iso, -dow);
}

function rangeFor(view: ViewMode, selected: string, timezone: string) {
  const start = view === 'day' ? selected : startOfWeek(selected);
  const end = addDays(start, view === 'day' ? 1 : 7);
  const from = new TZDate(start + 'T00:00:00', timezone).toISOString();
  const to = new TZDate(end + 'T00:00:00', timezone).toISOString();
  return { start, end, from, to };
}

function formatDate(iso: string, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: timezone, ...options }).format(new Date(iso + 'T00:00:00Z'));
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function localISO(value: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value);
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day;
}

function timeParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(value));
  const p = Object.fromEntries(parts.filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return (p.hour ?? 0) * 60 + (p.minute ?? 0);
}

function minutesOf(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function clockLabel(minute: number): string {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
}

function toZonedStart(date: string, minute: number, timezone: string): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return new TZDate(
    date + 'T' + String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0') + ':00',
    timezone,
  ).toISOString();
}

function allowed(status: ApptStatus, action: string): boolean {
  if (action === 'confirm') return status === 'pending';
  if (action === 'start') return status === 'confirmed';
  if (action === 'complete') return status === 'in_progress';
  if (action === 'no_show') return status === 'confirmed';
  if (action === 'cancel' || action === 'reschedule') return status === 'pending' || status === 'confirmed';
  return false;
}

function AppointmentCard({
  appointment,
  timezone,
  gridStart,
  onAction,
  onReschedule,
  busy,
}: {
  appointment: AgendaAppointment;
  timezone: string;
  gridStart: number;
  onAction: (action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel', appointment: AgendaAppointment) => void;
  onReschedule: (appointment: AgendaAppointment, targetBarberId?: string) => void;
  busy: boolean;
}) {
  const canDrag = allowed(appointment.status, 'reschedule') && !busy;
  const top = Math.max(0, (timeParts(appointment.starts_at, timezone) - gridStart) * PX_PER_MINUTE);
  const height = Math.max(56, appointment.duration_min * PX_PER_MINUTE);
  return (
    <article
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', appointment.appointment_id);
        event.dataTransfer.setData('application/x-barberos-barber', appointment.barber_id);
      }}
      className="absolute inset-x-1 rounded-2xl border border-accent-soft/25 bg-accent-soft/10 p-3 overflow-hidden"
      style={{ top, minHeight: height }}
      data-testid={'agenda-appointment-' + appointment.appointment_id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-hi truncate">{appointment.customer_name}</p>
          <p className="t-label text-ink-mid truncate mt-0.5">{appointment.service_name}</p>
        </div>
        {canDrag && <Move size={13} className="text-accent-soft shrink-0" aria-hidden />}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="t-label text-ink-hi">{formatTime(appointment.starts_at, timezone)}</span>
        <span className="t-label text-ink-mid">· {appointment.duration_min} min</span>
      </div>
      <div className="flex items-center gap-2 mt-2"><StatusChip status={appointment.status} />{appointment.deposit_status === 'awaiting' && <span className="t-label text-st-pending">Sinal</span>}</div>
      <div className="flex items-center gap-1 mt-2">
        {allowed(appointment.status, 'confirm') && appointment.deposit_status !== 'awaiting' && <ActionButton label="Confirmar" onClick={() => onAction('confirm', appointment)} busy={busy}><CheckCircle2 size={14} /></ActionButton>}
        {allowed(appointment.status, 'start') && new Date(appointment.starts_at).getTime() <= Date.now() + 30 * 60 * 1000 && <ActionButton label="Iniciar atendimento" onClick={() => onAction('start', appointment)} busy={busy}><Play size={14} /></ActionButton>}
        {allowed(appointment.status, 'complete') && <ActionButton label="Concluir atendimento" onClick={() => onAction('complete', appointment)} busy={busy}><CheckCircle2 size={14} /></ActionButton>}
        {allowed(appointment.status, 'no_show') && new Date(appointment.starts_at).getTime() <= Date.now() + 30 * 60 * 1000 && <ActionButton label="Marcar falta" onClick={() => onAction('no_show', appointment)} busy={busy}><UserX size={14} /></ActionButton>}
        {allowed(appointment.status, 'cancel') && <ActionButton label="Cancelar marcação" onClick={() => onAction('cancel', appointment)} busy={busy}><X size={14} /></ActionButton>}
        {allowed(appointment.status, 'reschedule') && <ActionButton label="Remarcar" onClick={() => onReschedule(appointment)} busy={busy}><RefreshCw size={14} /></ActionButton>}
        {appointment.customer_phone && (
          <a
            href={buildWhatsAppLink(appointment.customer_phone, 'Olá ' + appointment.customer_name + ', falamos da sua marcação na nossa barbearia.')}
            target="_blank"
            rel="noreferrer"
            aria-label={'Abrir WhatsApp de ' + appointment.customer_name}
            title="WhatsApp"
            className="p-1.5 rounded-lg text-accent-soft hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          >
            <MessageCircle size={14} />
          </a>
        )}
      </div>
    </article>
  );
}

function ActionButton({
  label, onClick, busy, children,
}: { label: string; onClick: () => void; busy: boolean; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={busy} className="p-1.5 rounded-lg hover:bg-white/10 text-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50">{children}</button>;
}

function DayGrid({
  date,
  timezone,
  schedule,
  appointments,
  onAction,
  onReschedule,
  busyId,
}: {
  date: string;
  timezone: string;
  schedule: AgendaSchedule[];
  appointments: AgendaAppointment[];
  onAction: (action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel', appointment: AgendaAppointment) => void;
  onReschedule: (appointment: AgendaAppointment, targetBarberId?: string) => void;
  busyId: string | null;
}) {
  const dayRows = schedule.filter((row) => row.schedule_date === date);
  const columns = dayRows.filter((row) => !row.is_closed || appointments.some((a) => a.barber_id === row.barber_id));
  const openRows = dayRows.filter((row) => !row.is_closed);
  const gridStart = Math.floor((Math.min(...openRows.map((x) => minutesOf(x.opens_at)), 8 * 60)) / GRID_STEP) * GRID_STEP;
  const gridEnd = Math.ceil((Math.max(...openRows.map((x) => minutesOf(x.closes_at)), 20 * 60)) / GRID_STEP) * GRID_STEP;
  const height = (gridEnd - gridStart) * PX_PER_MINUTE;
  const today = todayISO(timezone);
  const nowMinute = today === date ? timeParts(new Date().toISOString(), timezone) : null;
  const gridSteps = Math.floor((gridEnd - gridStart) / GRID_STEP);

  if (!columns.length) return <EmptyState title="Sem barbeiros activos" body="Adicione pelo menos um barbeiro activo para abrir a agenda." />;

  const dropOnColumn = (event: DragEvent<HTMLDivElement>, barberId: string) => {
    event.preventDefault();
    const appointmentId = event.dataTransfer.getData('text/plain');
    if (!appointmentId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = gridStart + Math.round(((event.clientY - rect.top) / PX_PER_MINUTE) / GRID_STEP) * GRID_STEP;
    const targetMinute = Math.max(gridStart, Math.min(gridEnd - GRID_STEP, raw));
    const appointment = appointments.find((x) => x.appointment_id === appointmentId);
    if (appointment) onReschedule({ ...appointment, starts_at: toZonedStart(date, targetMinute, timezone) }, barberId);
  };

  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[5rem_repeat(auto-fit,minmax(13rem,1fr))] border-b border-white/10 bg-white/[.03]">
          <div className="p-3 t-label text-ink-mid">Hora</div>
          {columns.map((column) => <div key={column.barber_id} className="p-3 border-l border-white/5"><p className="t-card text-ink-hi truncate">{column.barber_name}</p><p className="t-label text-ink-mid mt-0.5">{column.is_closed ? 'Fechado' : column.opens_at.slice(0,5) + '–' + column.closes_at.slice(0,5)}</p></div>)}
        </div>
        <div className="grid grid-cols-[5rem_repeat(auto-fit,minmax(13rem,1fr))]">
          <div className="relative" style={{ height }}>
            {Array.from({ length: gridSteps + 1 }).map((_, index) => {
              const minute = gridStart + index * GRID_STEP;
              return <div key={minute} className="absolute inset-x-0 -translate-y-2 text-right pr-2" style={{ top: (minute - gridStart) * PX_PER_MINUTE }}><span className="t-label text-ink-mid">{clockLabel(minute)}</span></div>;
            })}
          </div>
          {columns.map((column) => {
            const items = appointments.filter((a) => a.barber_id === column.barber_id);
            return (
              <div
                key={column.barber_id}
                className="relative border-l border-white/5 bg-white/[.015]"
                style={{ height }}
                onDragOver={(event) => { if (!column.is_closed) event.preventDefault(); }}
                onDrop={(event) => dropOnColumn(event, column.barber_id)}
                data-testid={'agenda-column-' + column.barber_id}
              >
                {Array.from({ length: gridSteps }).map((_, index) => <div key={index} className="absolute inset-x-0 border-t border-white/5" style={{ top: index * GRID_STEP * PX_PER_MINUTE }} />)}
                {nowMinute !== null && nowMinute >= gridStart && nowMinute <= gridEnd && <div className="absolute inset-x-0 h-px bg-accent-soft z-10" style={{ top: (nowMinute - gridStart) * PX_PER_MINUTE }} aria-hidden />}
                {items.map((appointment) => <AppointmentCard key={appointment.appointment_id} appointment={appointment} timezone={timezone} gridStart={gridStart} onAction={onAction} onReschedule={onReschedule} busy={busyId === appointment.appointment_id} />)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekBoard({
  start,
  timezone,
  appointments,
  onAction,
  onReschedule,
  busyId,
}: {
  start: string;
  timezone: string;
  appointments: AgendaAppointment[];
  onAction: (action: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel', appointment: AgendaAppointment) => void;
  onReschedule: (appointment: AgendaAppointment, targetBarberId?: string) => void;
  busyId: string | null;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10">
      <div className="grid grid-cols-7 min-w-[980px]">
        {days.map((day) => {
          const items = appointments.filter((a) => localISO(a.starts_at, timezone) === day);
          return (
            <section key={day} className="min-h-[34rem] border-l first:border-l-0 border-white/5 p-3 bg-white/[.015]">
              <header className="pb-3 border-b border-white/5">
                <p className="t-label text-ink-mid">{formatDate(day, timezone, { weekday: 'short' })}</p>
                <p className="text-2xl text-ink-hi mt-1">{day.slice(8,10)}</p>
                <p className="t-label text-ink-mid mt-1">{items.length} {items.length === 1 ? 'marcação' : 'marcações'}</p>
              </header>
              <div className="space-y-2 mt-3">
                {items.length ? items.map((appointment) => (
                  <article key={appointment.appointment_id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-ink-hi truncate">{appointment.customer_name}</p><span className="t-label text-ink-mid">{formatTime(appointment.starts_at, timezone)}</span></div>
                    <p className="t-label text-ink-mid mt-1 truncate">{appointment.service_name} · {appointment.barber_name}</p>
                    <div className="mt-2"><StatusChip status={appointment.status} /></div>
                    <div className="flex gap-1 mt-2">
                      {appointment.customer_phone && <a href={buildWhatsAppLink(appointment.customer_phone, 'Olá ' + appointment.customer_name + ', falamos da sua marcação.')} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-accent-soft hover:bg-white/10" aria-label="Abrir WhatsApp"><MessageCircle size={14} /></a>}
                      {allowed(appointment.status, 'reschedule') && <button type="button" onClick={() => onReschedule(appointment)} aria-label="Remarcar" className="p-1.5 rounded-lg text-ink-mid hover:bg-white/10"><RefreshCw size={14} /></button>}
                      {allowed(appointment.status, 'confirm') && appointment.deposit_status !== 'awaiting' && <button type="button" onClick={() => onAction('confirm', appointment)} aria-label="Confirmar" className="p-1.5 rounded-lg text-st-confirmed hover:bg-white/10"><CheckCircle2 size={14} /></button>}
                    </div>
                  </article>
                )) : <p className="t-label text-ink-mid py-3">Sem marcações.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const { shop } = useShop();
  const timezone = shop?.timezone ?? 'Africa/Maputo';
  const [view, setView] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(() => todayISO(timezone));
  const [rescheduleAppointment, setRescheduleAppointment] = useState<AgendaAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(selectedDate);
  const [busyId, setBusyId] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(view, selectedDate, timezone), [view, selectedDate, timezone]);
  const appointmentsQuery = useAgendaAppointments(shop?.id, range.from, range.to);
  const scheduleQuery = useAgendaSchedule(shop?.id, range.start, addDays(range.start, view === 'day' ? 0 : 6));
  const actionMutation = useAppointmentAction();
  const rescheduleMutation = useOperatorReschedule();

  const rescheduleSlotsQuery = useAvailableSlots({
    slug: shop?.slug,
    serviceId: rescheduleAppointment?.service_id,
    barberId: rescheduleAppointment?.barber_id ?? null,
    date: rescheduleDate,
  });

  if (!shop) return null;

  const appointments = appointmentsQuery.data ?? [];
  const schedule = scheduleQuery.data ?? [];
  const today = todayISO(timezone);
  const label = view === 'day'
    ? formatDate(selectedDate, timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : formatDate(range.start, timezone, { day: 'numeric', month: 'short' }) + ' – ' + formatDate(addDays(range.start, 6), timezone, { day: 'numeric', month: 'short', year: 'numeric' });

  const goPeriod = (direction: number) => {
    setSelectedDate(addDays(selectedDate, view === 'day' ? direction : direction * 7));
    setRescheduleAppointment(null);
  };

  const handleAction = async (appointmentAction: 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel', appointment: AgendaAppointment) => {
    let reason: string | null = null;
    if (appointmentAction === 'cancel') {
      if (!window.confirm('Cancelar esta marcação?')) return;
      reason = window.prompt('Motivo do cancelamento (opcional):');
      if (reason && reason.length > 500) {
        toast.error('O motivo pode ter no máximo 500 caracteres.');
        return;
      }
    }
    setBusyId(appointment.appointment_id);
    try {
      await actionMutation.mutateAsync({
        shopId: shop.id,
        appointmentId: appointment.appointment_id,
        action: appointmentAction,
        reason,
      });
      const success = appointmentAction === 'confirm' ? 'Marcação confirmada.' :
        appointmentAction === 'start' ? 'Atendimento iniciado.' :
        appointmentAction === 'complete' ? 'Atendimento concluído.' :
        appointmentAction === 'no_show' ? 'Falta registada.' : 'Marcação cancelada.';
      toast.success(success);
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusyId(null);
    }
  };

  const submitReschedule = async (newStart: string, newBarberId?: string | null) => {
    if (!rescheduleAppointment) return;
    setBusyId(rescheduleAppointment.appointment_id);
    try {
      await rescheduleMutation.mutateAsync({
        shopId: shop.id,
        appointmentId: rescheduleAppointment.appointment_id,
        newStart,
        newBarberId,
      });
      toast.success('Marcação remarcada.');
      setRescheduleAppointment(null);
      await appointmentsQuery.refetch();
    } catch (error) {
      toast.error(humanError(error));
    } finally {
      setBusyId(null);
    }
  };

  const openReschedule = (appointment: AgendaAppointment) => {
    setRescheduleAppointment(appointment);
    setRescheduleDate(localISO(appointment.starts_at, timezone));
  };

  return (
    <Page
      testId="agenda-page"
      title="Agenda"
      subtitle={label}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" pill onClick={() => { setSelectedDate(today); setView('day'); }}>Hoje</Button>
          <div className="flex rounded-full border border-white/10 overflow-hidden" role="group" aria-label="Visualização da agenda">
            <button type="button" onClick={() => setView('day')} aria-pressed={view === 'day'} className={'px-3 h-9 t-label ' + (view === 'day' ? 'bg-white/10 text-ink-hi' : 'text-ink-mid')}>Dia</button>
            <button type="button" onClick={() => setView('week')} aria-pressed={view === 'week'} className={'px-3 h-9 t-label ' + (view === 'week' ? 'bg-white/10 text-ink-hi' : 'text-ink-mid')}>Semana</button>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" pill onClick={() => goPeriod(-1)} aria-label="Período anterior"><ChevronLeft size={17} /></Button>
          <Button variant="ghost" size="sm" pill onClick={() => goPeriod(1)} aria-label="Período seguinte"><ChevronRight size={17} /></Button>
          <span className="t-body text-ink-hi capitalize">{label}</span>
        </div>
        <div className="flex items-center gap-2 text-ink-mid"><Clock3 size={15} /><span className="t-label">{timezone}</span></div>
      </div>

      {appointmentsQuery.isLoading || scheduleQuery.isLoading ? (
        <div className="grid lg:grid-cols-[1fr_20rem] gap-4"><Skeleton className="h-[42rem]" lines={10} /><Skeleton className="h-64" lines={6} /></div>
      ) : appointmentsQuery.error || scheduleQuery.error ? (
        <ErrorState message={humanError(appointmentsQuery.error ?? scheduleQuery.error)} onRetry={() => { void appointmentsQuery.refetch(); void scheduleQuery.refetch(); }} />
      ) : (
        <>
          {view === 'day'
            ? <DayGrid date={selectedDate} timezone={timezone} schedule={schedule} appointments={appointments} onAction={handleAction} onReschedule={openReschedule} busyId={busyId} />
            : <WeekBoard start={range.start} timezone={timezone} appointments={appointments} onAction={handleAction} onReschedule={openReschedule} busyId={busyId} />}

          {appointments.length === 0 && <div className="mt-4"><EmptyState title="Agenda livre" body="Não há marcações neste período." /></div>}

          {rescheduleAppointment && (
            <Panel
              title="Remarcar marcação"
              className="mt-4"
              testId="agenda-reschedule-panel"
              aside={<button type="button" aria-label="Fechar remarcação" onClick={() => setRescheduleAppointment(null)} className="p-1 rounded-lg text-ink-mid hover:bg-white/10"><X size={17} /></button>}
            >
              <div className="grid lg:grid-cols-[18rem_1fr] gap-5">
                <div>
                  <p className="t-card text-ink-hi">{rescheduleAppointment.customer_name}</p>
                  <p className="t-body text-ink-mid mt-1">{rescheduleAppointment.service_name}</p>
                  <p className="t-label text-ink-mid mt-1">{rescheduleAppointment.barber_name} · {formatMT(rescheduleAppointment.price_cents)}</p>
                  <label className="block mt-5">
                    <span className="t-label text-ink-mid mb-1.5 block">Novo dia</span>
                    <input type="date" value={rescheduleDate} min={today} onChange={(e) => setRescheduleDate(e.target.value)} className="field" />
                  </label>
                </div>
                <div>
                  <p className="t-label text-ink-mid mb-3">Horas disponíveis</p>
                  {rescheduleSlotsQuery.isLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2"><Skeleton className="h-11" lines={1} /><Skeleton className="h-11" lines={1} /></div>
                  ) : rescheduleSlotsQuery.error ? (
                    <ErrorState message={humanError(rescheduleSlotsQuery.error)} onRetry={() => rescheduleSlotsQuery.refetch()} />
                  ) : rescheduleSlotsQuery.data?.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {rescheduleSlotsQuery.data.map((slot) => (
                        <button key={slot.slot_start} type="button" onClick={() => void submitReschedule(slot.slot_start)} disabled={busyId === rescheduleAppointment.appointment_id} className="h-11 rounded-2xl border border-white/10 bg-white/5 t-body text-ink-hi hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50">{formatTime(slot.slot_start, timezone)}</button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Sem horas disponíveis" body="Escolha outro dia para remarcar." />
                  )}
                </div>
              </div>
            </Panel>
          )}
        </>
      )}
    </Page>
  );
}
