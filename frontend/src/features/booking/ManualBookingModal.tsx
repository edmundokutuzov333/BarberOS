import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ExternalLink, MessageCircle, Scissors, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Primitives';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { formatMT, humanError } from '@/lib/utils';
import { buildWhatsAppLink } from '@/lib/calendar';
import { normalizeMozPhone } from '@/features/booking/api';
import { useAvailableDays, useAvailableSlots } from '@/features/availability/api';
import {
  useBookManualAppointment,
  useManualBookingCatalog,
  type ManualBookingResult,
  type ManualService,
  type ManualHaircut,
  type ManualBarber,
} from '@/features/booking/manual-api';
import { useShop } from '@/lib/shop';
import { useAuth } from '@/lib/auth';

function datePartsInZone(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
}

function todayInZone(timezone: string): string {
  const parts = datePartsInZone(new Date(), timezone);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso + 'T00:00:00Z'));
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function validPhone(value: string): boolean {
  return /^\+2588[2-7]\d{7}$/.test(normalizeMozPhone(value).replace(/\s+/g, ''));
}

function validEmail(value: string): boolean {
  return !value || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function statusLabel(status: ManualBookingResult['status']): string {
  return status === 'confirmed' ? 'Confirmada' : 'À espera do sinal';
}

function ServiceOption({
  service,
  selected,
  disabled,
  onSelect,
}: {
  service: ManualService;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={'w-full rounded-2xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ' +
        (selected ? 'border-accent-soft/60 bg-accent-soft/10' : 'border-white/10 bg-white/5 hover:bg-white/[.07]') +
        (disabled ? ' opacity-45 cursor-not-allowed' : '')}
    >
      <p className="t-card text-ink-hi truncate">{service.name}</p>
      <p className="t-label text-ink-mid mt-1">{formatMT(service.price_cents)} · {service.duration_min} min</p>
    </button>
  );
}

function ResultView({
  result,
  customerPhone,
  timezone,
  shopName,
  barberName,
  onClose,
}: {
  result: ManualBookingResult;
  customerPhone: string;
  timezone: string;
  shopName: string;
  barberName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const manageUrl = window.location.origin + '/marcacao/' + result.manage_token;
  const whatsApp = buildWhatsAppLink(
    customerPhone,
    'Olá! A sua marcação na ' + shopName + ' ficou ' +
      (result.status === 'confirmed' ? 'confirmada' : 'pendente de sinal') +
      ' para ' + formatDate(result.starts_at, timezone) + ' às ' + formatTime(result.starts_at, timezone) + '.',
  );

  return (
    <div className="space-y-5" data-testid="manual-booking-success">
      <div className="rounded-3xl border border-st-done/20 bg-st-done/10 p-5 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-st-done/15 grid place-items-center text-st-done">
          <CheckCircle2 size={24} aria-hidden />
        </div>
        <p className="t-title mt-4">{result.status === 'confirmed' ? 'Marcação criada' : 'Marcação criada, sinal pendente'}</p>
        <p className="t-body text-ink-mid mt-2">{formatDate(result.starts_at, timezone)} · {formatTime(result.starts_at, timezone)}</p>
        <p className="t-label text-ink-mid mt-1">{statusLabel(result.status)}</p>
        {result.deposit_cents > 0 && <p className="t-label text-ink-mid mt-2">Sinal: {formatMT(result.deposit_cents)}</p>}
      </div>

      <Panel title="Detalhes" testId="manual-booking-success-details">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex gap-3"><UserRound size={16} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Barbeiro</p><p className="t-body text-ink-hi mt-0.5">{barberName}</p></div></div>
          <div className="flex gap-3"><Clock3 size={16} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Horário</p><p className="t-body text-ink-hi mt-0.5">{formatTime(result.starts_at, timezone)} · {Math.round((new Date(result.ends_at).getTime() - new Date(result.starts_at).getTime()) / 60000)} min</p></div></div>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <a
          href={whatsApp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-soft px-4 h-10 text-accent-ink text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <MessageCircle size={15} />Enviar WhatsApp
        </a>
        <a
          href={manageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 h-10 text-ink-hi text-sm hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <ExternalLink size={15} />Abrir gestão
        </a>
        <Button
          variant="secondary"
          size="sm"
          pill
          onClick={() => {
            onClose();
            navigate('/app/agenda');
          }}
        >
          Ver agenda
        </Button>
      </div>
    </div>
  );
}

export default function ManualBookingModal({
  open,
  onOpenChange,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onBooked?: (result: ManualBookingResult) => void;
}) {
  const { shop, role } = useShop();
  const { user } = useAuth();
  const catalogQuery = useManualBookingCatalog(shop?.id);
  const bookingMutation = useBookManualAppointment();

  const timezone = shop?.timezone ?? 'Africa/Maputo';
  const today = todayInZone(timezone);
  const maxDate = shop ? addDaysISO(today, shop.max_advance_days) : today;

  const [serviceId, setServiceId] = useState('');
  const [haircutId, setHaircutId] = useState('');
  const [barberId, setBarberId] = useState('any');
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ManualBookingResult | null>(null);

  const catalog = catalogQuery.data;
  const service = catalog?.services.find((item) => item.id === serviceId);
  const eligibleBarbers = useMemo(
    () => catalog?.barbers.filter((barber) => barber.barber_services.some((row) => row.service_id === serviceId)) ?? [],
    [catalog?.barbers, serviceId],
  );
  const eligibleHaircuts = useMemo(
    () => catalog?.haircuts.filter((haircut) => !haircut.service_id || haircut.service_id === serviceId) ?? [],
    [catalog?.haircuts, serviceId],
  );
  const ownBarber = role === 'barber' ? eligibleBarbers.find((barber) => barber.user_id === user?.id) : undefined;
  const selectedBarberId = role === 'barber'
    ? ownBarber?.id ?? null
    : barberId === 'any' || !barberId ? null : barberId;

  const daysQuery = useAvailableDays({
    slug: shop?.slug,
    serviceId: service?.id,
    barberId: selectedBarberId,
    from: today,
    to: maxDate,
  });
  const slotsQuery = useAvailableSlots({
    slug: shop?.slug,
    serviceId: service?.id,
    barberId: selectedBarberId,
    date,
  });

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setErrors({});
    setServiceId('');
    setHaircutId('');
    setBarberId(role === 'barber' ? ownBarber?.id ?? '' : 'any');
    setDate(today);
    setStart('');
    setForm({ name: '', phone: '', email: '', note: '' });
  }, [open, role, ownBarber?.id, today]);

  useEffect(() => {
    if (!serviceId) {
      setHaircutId('');
      setStart('');
      return;
    }
    if (haircutId && !eligibleHaircuts.some((item) => item.id === haircutId)) setHaircutId('');
    if (barberId && barberId !== 'any' && !eligibleBarbers.some((item) => item.id === barberId)) setBarberId('any');
    setStart('');
  }, [serviceId, eligibleHaircuts, eligibleBarbers, role, ownBarber, haircutId, barberId]);

  if (!shop) return null;

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!service) nextErrors.service = 'Escolhe um serviço.';
    if (role === 'barber' && !ownBarber) nextErrors.barber = 'O teu perfil de barbeiro não está ligado a esta loja.';
    if (!start) nextErrors.start = 'Escolhe um horário.';
    if (!form.name.trim() || form.name.trim().length < 2 || form.name.trim().length > 120) nextErrors.name = 'Escreve um nome válido.';
    if (!validPhone(form.phone)) nextErrors.phone = 'Número inválido. Usa o formato 84 000 0000.';
    if (!validEmail(form.email)) nextErrors.email = 'Indica um email válido.';
    if (form.note.length > 1000) nextErrors.note = 'A nota pode ter no máximo 1000 caracteres.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      const created = await bookingMutation.mutateAsync({
        shopId: shop.id,
        serviceId: service!.id,
        haircutId: haircutId || null,
        barberId: selectedBarberId,
        start,
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        internalNote: form.note || null,
      });
      setResult(created);
      onBooked?.(created);
      toast.success(created.status === 'confirmed' ? 'Marcação criada e confirmada.' : 'Marcação criada. O sinal está pendente.');
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  const close = () => {
    if (!bookingMutation.isPending) onOpenChange(false);
  };

  if (result) {
    const assignedBarber = catalog?.barbers.find((barber) => barber.id === result.barber_id)?.display_name ?? 'Barbeiro';
    return (
      <Modal open={open} onOpenChange={close} title="Marcação manual" testId="manual-booking-modal">
        <ResultView
          result={result}
          customerPhone={form.phone}
          timezone={timezone}
          shopName={shop.name}
          barberName={assignedBarber}
          onClose={() => onOpenChange(false)}
        />
      </Modal>
    );
  }

  const hasServiceBarber = (item: ManualService) =>
    catalog?.barbers.some((barber) => barber.barber_services.some((row) => row.service_id === item.id)) ?? false;

  return (
    <Modal open={open} onOpenChange={close} title="Nova marcação" testId="manual-booking-modal">
      {catalogQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14" lines={2} />
          <Skeleton className="h-28" lines={4} />
          <Skeleton className="h-28" lines={4} />
        </div>
      ) : catalogQuery.error ? (
        <ErrorState message={humanError(catalogQuery.error)} onRetry={() => catalogQuery.refetch()} />
      ) : !catalog?.services.length || !catalog.barbers.length ? (
        <EmptyState title="A agenda ainda não está configurada" body="É necessário ter pelo menos um serviço activo e um barbeiro activo associados à loja." />
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-3"><Scissors size={16} className="text-accent-soft" /><p className="t-card">Serviço</p></div>
            <div className="grid sm:grid-cols-2 gap-2" data-testid="manual-booking-services">
              {catalog.services.map((item) => (
                <ServiceOption
                  key={item.id}
                  service={item}
                  selected={serviceId === item.id}
                  disabled={!hasServiceBarber(item)}
                  onSelect={() => setServiceId(item.id)}
                />
              ))}
            </div>
            {!catalog.services.some(hasServiceBarber) && <p className="t-label text-st-noshow mt-2">Associe pelo menos um barbeiro activo a um serviço.</p>}
          </div>

          {service && (
            <>
              <div className="grid lg:grid-cols-2 gap-4">
                <label className="block">
                  <span className="t-label text-ink-mid mb-1.5 block">Corte</span>
                  <select
                    data-testid="manual-booking-haircut"
                    value={haircutId}
                    onChange={(e) => setHaircutId(e.target.value)}
                    className="field appearance-none"
                  >
                    <option value="">Sem corte específico</option>
                    {eligibleHaircuts.map((item: ManualHaircut) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>

                {role !== 'barber' ? (
                  <label className="block">
                    <span className="t-label text-ink-mid mb-1.5 block">Barbeiro</span>
                    <select
                      data-testid="manual-booking-barber"
                      value={barberId}
                      onChange={(e) => { setBarberId(e.target.value); setStart(''); }}
                      className="field appearance-none"
                    >
                      <option value="any">Qualquer barbeiro disponível</option>
                      {eligibleBarbers.map((item: ManualBarber) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="t-label text-ink-mid">Barbeiro</p>
                    <p className="t-body text-ink-hi mt-1">{ownBarber?.display_name ?? 'Perfil não ligado'}</p>
                    {errors.barber && <p className="t-label text-st-noshow mt-1">{errors.barber}</p>}
                  </div>
                )}
              </div>

              <div className="grid lg:grid-cols-[14rem_1fr] gap-4">
                <div>
                  <label className="block">
                    <span className="t-label text-ink-mid mb-1.5 block">Dia</span>
                    <input
                      data-testid="manual-booking-date"
                      type="date"
                      value={date}
                      min={today}
                      max={maxDate}
                      onChange={(e) => { setDate(e.target.value); setStart(''); }}
                      className="field"
                    />
                  </label>
                  <p className="t-label text-ink-mid mt-2">{timezone}</p>
                </div>
                <div>
                  <p className="t-label text-ink-mid mb-2">Hora disponível</p>
                  {slotsQuery.isLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2"><Skeleton className="h-10" lines={1} /><Skeleton className="h-10" lines={1} /><Skeleton className="h-10" lines={1} /></div>
                  ) : slotsQuery.error ? (
                    <ErrorState message={humanError(slotsQuery.error)} onRetry={() => slotsQuery.refetch()} />
                  ) : slotsQuery.data?.length ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="manual-booking-slots">
                      {slotsQuery.data.map((slot) => (
                        <button
                          key={slot.slot_start}
                          type="button"
                          aria-pressed={start === slot.slot_start}
                          onClick={() => { setStart(slot.slot_start); setErrors((current) => ({ ...current, start: '' })); }}
                          className={'h-10 rounded-2xl border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ' +
                            (start === slot.slot_start ? 'border-accent-soft bg-accent-soft/15 text-ink-hi' : 'border-white/10 bg-white/5 text-ink-mid hover:bg-white/[.07]')}
                        >
                          {formatTime(slot.slot_start, timezone)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Sem vagas neste dia" body="Escolhe outra data ou usa o primeiro dia livre abaixo." />
                  )}
                  {errors.start && <p className="t-label text-st-noshow mt-2">{errors.start}</p>}
                  {!slotsQuery.data?.length && daysQuery.data?.some((day) => day.is_open && day.slots_count > 0) && (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <p className="t-label text-ink-mid">Próximo dia com vaga</p>
                      {(() => {
                        const next = daysQuery.data.find((day) => day.is_open && day.slots_count > 0 && day.day !== date);
                        return next ? (
                          <button type="button" onClick={() => { setDate(next.day); setStart(''); }} className="mt-1 text-sm text-accent-soft hover:text-ink-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft rounded">
                            {formatDate(next.day, timezone)}
                          </button>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="grid lg:grid-cols-2 gap-4">
                  <Field data-testid="manual-booking-name" label="Nome do cliente" name="manual_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} autoComplete="name" />
                  <Field data-testid="manual-booking-phone" label="Telefone" name="manual_phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} inputMode="tel" autoComplete="tel" placeholder="84 000 0000" />
                  <Field data-testid="manual-booking-email" label="Email" name="manual_email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} inputMode="email" autoComplete="email" placeholder="cliente@email.com" />
                  <Field data-testid="manual-booking-note" label="Nota interna (opcional)" name="manual_note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} error={errors.note} placeholder="Ex.: cliente pediu máquina 1" />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                <UserRound size={17} className="text-accent-soft mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="t-label text-ink-mid">Prévia</p>
                  <p className="t-body text-ink-hi mt-1">{service.name} · {formatMT(service.price_cents)}</p>
                  <p className="t-label text-ink-mid mt-1">{role === 'barber' ? ownBarber?.display_name ?? 'Barbeiro' : barberId === 'any' ? 'Qualquer barbeiro disponível' : eligibleBarbers.find((barber) => barber.id === barberId)?.display_name ?? 'Barbeiro'}</p>
                  {start && <p className="t-label text-ink-mid mt-1">{formatDate(date, timezone)} · {formatTime(start, timezone)}</p>}
                  {service.requires_deposit && shop.deposit_enabled && <p className="t-label text-st-pending mt-2">Este serviço exige sinal. A marcação ficará pendente até o pagamento.</p>}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="t-label text-ink-mid">A criação é feita pelo motor de booking e validada novamente no servidor.</p>
                <Button data-testid="manual-booking-submit" onClick={() => void submit()} loading={bookingMutation.isPending} disabled={!service || !start}>
                  Criar marcação
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
