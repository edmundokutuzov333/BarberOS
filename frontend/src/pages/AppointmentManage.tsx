import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarPlus, CheckCircle2, Clock3, MapPin, MessageCircle, Scissors, UserRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { StatusChip, type ApptStatus } from '@/components/ui/StatusChip';
import { Field } from '@/components/ui/Field';
import { humanError, formatMT } from '@/lib/utils';
import { buildWhatsAppLink, downloadAppointmentCalendar } from '@/lib/calendar';
import {
  useAppointmentByToken,
  useRescheduleSlotsByToken,
  useTokenCancellation,
  useTokenReschedule,
} from '@/features/appointments/token-api';

function localDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return get('year') + '-' + get('month') + '-' + get('day');
}

function formatDateTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function cancellationHelp(rule: string): string {
  if (rule === 'contact_only') return 'Para alterar esta marcação, fale directamente com a barbearia.';
  return 'As alterações só podem ser feitas dentro do prazo definido pela barbearia.';
}

export default function AppointmentManage() {
  const { token } = useParams<{ token: string }>();
  const [mode, setMode] = useState<'view' | 'cancel' | 'reschedule'>('view');
  const [cancelReason, setCancelReason] = useState('');
  const [date, setDate] = useState('');
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const query = useAppointmentByToken(token);
  const cancelMutation = useTokenCancellation();
  const rescheduleMutation = useTokenReschedule();
  const slotQuery = useRescheduleSlotsByToken(token, date, mode === 'reschedule');

  const data = query.data;
  const manageUrl = window.location.href;

  useEffect(() => {
    if (data) setDate(localDate(data.appointment_starts_at, data.timezone));
  }, [data]);

  const whatsappMessage = useMemo(() => {
    if (!data) return '';
    return 'Olá, preciso de ajuda com a minha marcação na ' + data.shop_name + '. Link: ' + manageUrl;
  }, [data, manageUrl]);

  const submitCancel = async () => {
    if (!token) return;
    try {
      await cancelMutation.mutateAsync({ p_token: token, p_reason: cancelReason.trim() || null });
      toast.success('Marcação cancelada.');
      setMode('view');
      await query.refetch();
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  const submitReschedule = async () => {
    if (!token || !selectedStart) return;
    try {
      await rescheduleMutation.mutateAsync({ p_token: token, p_new_start: selectedStart });
      toast.success('Marcação remarcada.');
      setMode('view');
      setSelectedStart(null);
      await query.refetch();
    } catch (error) {
      toast.error(humanError(error));
      await query.refetch();
    }
  };

  if (query.isLoading) {
    return (
      <div className="min-h-screen px-5 py-8 sm:px-8">
        <header className="max-w-3xl mx-auto h-16 flex items-center"><Brand /></header>
        <main className="max-w-3xl mx-auto pt-10 space-y-4"><Skeleton className="h-36" /><Skeleton className="h-72" /></main>
      </div>
    );
  }

  if (query.error || !data) {
    return (
      <div className="min-h-screen px-5 py-8 sm:px-8">
        <header className="max-w-3xl mx-auto h-16 flex items-center"><Link to="/" aria-label="Início"><Brand /></Link></header>
        <main className="max-w-3xl mx-auto pt-14">
          <ErrorState message={humanError(query.error ?? new Error('APPOINTMENT_NOT_FOUND'))} onRetry={() => query.refetch()} />
          <p className="t-body text-ink-mid mt-4 text-center">Use o link original recebido da barbearia ou peça um novo link.</p>
        </main>
      </div>
    );
  }

  const canActions = data.appointment_status === 'pending' || data.appointment_status === 'confirmed';
  const hasContact = Boolean(data.shop_whatsapp || data.shop_phone);

  return (
    <div className="min-h-screen px-5 py-8 sm:px-8">
      <header className="max-w-3xl mx-auto h-16 flex items-center justify-between gap-4">
        <Link to="/" aria-label="Início"><Brand /></Link>
        <span className="t-label text-ink-mid">Gestão da marcação</span>
      </header>

      <main className="max-w-3xl mx-auto pt-8 pb-16">
        <div className="mb-6">
          <p className="t-label text-accent-soft">BARBEROS BY ORYON</p>
          <h1 className="t-title text-ink-hi mt-2">A sua marcação</h1>
          <p className="t-body text-ink-mid mt-1">Olá, {data.customer_name}. Pode consultar e gerir esta marcação neste link.</p>
        </div>

        <Panel className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="t-card text-ink-hi">{data.shop_name}</p>
              <p className="t-body text-ink-mid mt-1">{data.service_name}{data.haircut_name ? ' · ' + data.haircut_name : ''}</p>
            </div>
            <StatusChip status={data.appointment_status as ApptStatus} />
          </div>

          <div className="mt-7 grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-2 text-accent-soft"><Clock3 size={16} /><span className="t-label">Data e hora</span></div>
              <p className="t-body text-ink-hi mt-2 capitalize">{formatDateTime(data.appointment_starts_at, data.timezone)}</p>
              <p className="t-label text-ink-mid mt-1">{data.service_duration_min} minutos</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-2 text-accent-soft"><UserRound size={16} /><span className="t-label">Barbeiro</span></div>
              <p className="t-body text-ink-hi mt-2">{data.barber_name}</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-2 text-accent-soft"><Scissors size={16} /><span className="t-label">Serviço</span></div>
              <p className="t-body text-ink-hi mt-2">{formatMT(data.service_price_cents)}</p>
              {data.deposit_cents > 0 && <p className="t-label text-ink-mid mt-1">Sinal: {formatMT(data.deposit_cents)} · {data.deposit_status}</p>}
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-2 text-accent-soft"><MapPin size={16} /><span className="t-label">Local</span></div>
              <p className="t-body text-ink-hi mt-2">{data.shop_address || 'Morada não definida'}</p>
              {data.shop_maps_url && <a href={data.shop_maps_url} target="_blank" rel="noreferrer" className="t-label text-accent-soft hover:text-ink-hi inline-block mt-1">Abrir no mapa</a>}
            </div>
          </div>

          {canActions && (data.can_cancel || data.can_reschedule) && mode === 'view' && (
            <div className="mt-7 flex flex-col sm:flex-row gap-2">
              {data.can_reschedule && <Button full size="md" variant="secondary" onClick={() => setMode('reschedule')}>Remarcar</Button>}
              {data.can_cancel && <Button full size="md" variant="danger" onClick={() => setMode('cancel')}>Cancelar marcação</Button>}
            </div>
          )}

          {canActions && !data.can_cancel && !data.can_reschedule && (
            <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="t-body text-ink-mid">{cancellationHelp(data.cancellation_rule)}</p>
              {data.action_deadline && data.cancellation_rule !== 'contact_only' && <p className="t-label text-ink-mid mt-1">Prazo: {formatDateTime(data.action_deadline, data.timezone)}</p>}
            </div>
          )}

          {mode === 'cancel' && (
            <div className="mt-7 rounded-3xl border border-st-noshow/25 bg-st-noshow/10 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <XCircle className="text-st-noshow mt-0.5 shrink-0" size={20} />
                <div className="flex-1">
                  <h2 className="t-card text-ink-hi">Confirmar cancelamento</h2>
                  <p className="t-body text-ink-mid mt-1">A vaga ficará novamente disponível depois do cancelamento.</p>
                  <label className="block mt-4" htmlFor="cancel-reason">
                    <span className="t-label text-ink-mid mb-1.5 block">Motivo (opcional)</span>
                    <textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} rows={3} className="field resize-none" placeholder="Ex.: surgiu um imprevisto" />
                  </label>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <Button full variant="danger" loading={cancelMutation.isPending} onClick={submitCancel}>Confirmar cancelamento</Button>
                    <Button full variant="ghost" disabled={cancelMutation.isPending} onClick={() => setMode('view')}>Voltar</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'reschedule' && (
            <div className="mt-7 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="t-card text-ink-hi">Escolher novo horário</h2>
                  <p className="t-body text-ink-mid mt-1">Escolha uma data e seleccione um horário realmente disponível.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setMode('view'); setSelectedStart(null); }}>Fechar</Button>
              </div>
              <div className="mt-5">
                <Field label="Nova data" name="reschedule-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedStart(null); }} min={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="mt-5" aria-live="polite" aria-busy={slotQuery.isLoading}>
                {slotQuery.isLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-11 !p-0" lines={0} />)}
                  </div>
                ) : slotQuery.error ? (
                  <ErrorState message={humanError(slotQuery.error)} onRetry={() => slotQuery.refetch()} />
                ) : slotQuery.data?.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                    <p className="t-card text-ink-hi">Sem horários disponíveis.</p>
                    <p className="t-body text-ink-mid mt-1">Escolha outra data.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slotQuery.data?.map((slot) => (
                      <button
                        key={slot.slot_start}
                        type="button"
                        onClick={() => setSelectedStart(slot.slot_start)}
                        aria-pressed={selectedStart === slot.slot_start}
                        className={"h-11 rounded-2xl border text-sm transition-colors " + (selectedStart === slot.slot_start ? 'border-accent bg-accent/15 text-ink-hi' : 'border-white/10 bg-white/5 text-ink-mid hover:border-white/20 hover:text-ink-hi')}
                      >
                        {formatTime(slot.slot_start, data.timezone)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-5 flex flex-col sm:flex-row gap-2">
                <Button full disabled={!selectedStart} loading={rescheduleMutation.isPending} onClick={submitReschedule}>Confirmar novo horário</Button>
                <Button full variant="ghost" disabled={rescheduleMutation.isPending} onClick={() => { setMode('view'); setSelectedStart(null); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </Panel>

        {(data.appointment_status === 'pending' || data.appointment_status === 'confirmed') && (
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Button full variant="secondary" onClick={() => downloadAppointmentCalendar(data, manageUrl)}><CalendarPlus size={16} />Adicionar ao calendário</Button>
            {hasContact && (
              <a href={buildWhatsAppLink(data.shop_whatsapp || data.shop_phone || '', whatsappMessage)} target="_blank" rel="noreferrer" className="block">
                <Button full variant="secondary"><MessageCircle size={16} />Falar com a barbearia</Button>
              </a>
            )}
          </div>
        )}

        {data.appointment_status === 'cancelled' && (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-5 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-st-cancelled mt-0.5" />
            <div><p className="t-card text-ink-hi">Marcação cancelada</p><p className="t-body text-ink-mid mt-1">Esta vaga já não está reservada.</p></div>
          </div>
        )}

        <p className="t-label text-ink-mid text-center mt-8">Esta página funciona sem conta. Guarde o link da marcação.</p>
      </main>
    </div>
  );
}