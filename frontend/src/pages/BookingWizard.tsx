import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock3, Mail, MessageCircle, Scissors, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Field } from '@/components/ui/Field';
import { buildWhatsAppLink } from '@/lib/calendar';
import { formatMT, humanError } from '@/lib/utils';
import { useAvailableDays, useAvailableSlots } from '@/features/availability/api';
import { normalizeMozPhone, useBookAppointment } from '@/features/booking/api';
import {
  usePublicBarbershop,
  type PublicBarber,
  type PublicHaircut,
  type PublicService,
} from '@/features/public-shop/api';

const STEP_LABELS = ['Serviço', 'Corte', 'Barbeiro', 'Data', 'Hora', 'Dados'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
};

function datePartsInZone(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
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

function formatDate(iso: string, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: timezone, ...options }).format(new Date(iso + 'T00:00:00Z'));
}

function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).format(new Date(value));
}

function validMozPhone(value: string): boolean {
  const normalized = normalizeMozPhone(value).replace(/\s+/g, '');
  return /^\+2588[2-7]\d{7}$/.test(normalized);
}

function validEmail(value: string): boolean {
  return !value || value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getDepositCents(service: PublicService, shop: { deposit_enabled: boolean; deposit_mode: 'percent' | 'fixed'; deposit_value: number }): number {
  if (!shop.deposit_enabled || !service.requires_deposit) return 0;
  if (shop.deposit_mode === 'fixed') return shop.deposit_value;
  return Math.round(service.price_cents * shop.deposit_value / 100);
}

function updateSearchParams(
  searchParams: URLSearchParams,
  setSearchParams: (params: URLSearchParams, options?: { replace?: boolean }) => void,
  changes: Record<string, string | null>,
) {
  const next = new URLSearchParams(searchParams);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  setSearchParams(next, { replace: true });
}

function StepHeader({ currentStep, shopName }: { currentStep: number; shopName: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to="" className="t-label text-ink-mid hover:text-ink-hi transition-colors">{shopName}</Link>
          <p className="t-label text-accent-soft mt-1">Marcação online</p>
        </div>
        <span className="t-label text-ink-mid">{currentStep} de {STEP_LABELS.length}</span>
      </div>
      <nav aria-label="Progresso da marcação" className="mt-5">
        <ol className="grid grid-cols-6 gap-1.5">
          {STEP_LABELS.map((label, index) => {
            const step = index + 1;
            const active = step === currentStep;
            const done = step < currentStep;
            return (
              <li key={label}>
                <div aria-current={active ? 'step' : undefined} className="space-y-2">
                  <div className={`h-1.5 rounded-full transition-colors ${done || active ? 'bg-accent-soft' : 'bg-white/10'}`} />
                  <span className={`hidden sm:block t-label truncate ${active ? 'text-ink-hi' : 'text-ink-mid'}`}>{label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

function ChoiceCard({
  title,
  body,
  meta,
  selected,
  onClick,
  disabled,
  testId,
}: {
  title: string;
  body?: string | null;
  meta?: string;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left rounded-3xl border p-4 sm:p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${selected ? 'border-accent-soft/60 bg-accent-soft/10' : 'border-white/10 bg-white/5 hover:bg-white/[.07]'} `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="t-card text-ink-hi">{title}</p>
          {body && <p className="t-body text-ink-mid mt-1.5">{body}</p>}
        </div>
        {selected && <Check size={18} className="text-accent-soft shrink-0 mt-0.5" aria-hidden />}
      </div>
      {meta && <p className="t-label text-accent-soft mt-3">{meta}</p>}
    </button>
  );
}

function BarberChoice({ barber, selected, onClick }: { barber: PublicBarber; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`w-full text-left rounded-3xl border p-4 sm:p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${selected ? 'border-accent-soft/60 bg-accent-soft/10' : 'border-white/10 bg-white/5 hover:bg-white/[.07]'}`}
    >
      <div className="flex items-center gap-4">
        {barber.photo_url ? (
          <img src={barber.photo_url} alt="" className="h-14 w-14 rounded-2xl object-cover" loading="lazy" />
        ) : (
          <div aria-hidden className="h-14 w-14 rounded-2xl bg-accent-soft/15 border border-accent-soft/15 grid place-items-center text-accent-soft text-lg">
            {barber.display_name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="t-card text-ink-hi truncate">{barber.display_name}</p>
          <p className="t-label text-ink-mid mt-1">{barber.years_experience} {barber.years_experience === 1 ? 'ano' : 'anos'} de experiência</p>
        </div>
        {selected && <Check size={18} className="text-accent-soft shrink-0" aria-hidden />}
      </div>
    </button>
  );
}

function Summary({
  shopName,
  service,
  haircut,
  barber,
  date,
  start,
  timezone,
  depositCents,
  depositConfigValid,
}: {
  shopName: string;
  service: PublicService | undefined;
  haircut: PublicHaircut | undefined;
  barber: PublicBarber | undefined;
  date: string | null;
  start: string | null;
  timezone: string;
  depositCents: number;
  depositConfigValid: boolean;
}) {
  return (
    <Panel title="Resumo" testId="booking-summary">
      <div className="space-y-3">
        <div className="flex gap-3"><Scissors size={16} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Serviço</p><p className="t-body text-ink-hi mt-0.5">{service?.name ?? 'Por escolher'}</p></div></div>
        <div className="flex gap-3"><Scissors size={16} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Corte</p><p className="t-body text-ink-hi mt-0.5">{haircut?.name ?? 'Sem preferência'}</p></div></div>
        <div className="flex gap-3"><UserRound size={16} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Barbeiro</p><p className="t-body text-ink-hi mt-0.5">{barber?.display_name ?? 'Qualquer barbeiro'}</p></div></div>
        <div className="flex gap-3"><Clock3 size={16} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Data e hora</p><p className="t-body text-ink-hi mt-0.5">{date ? formatDate(date, timezone, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Por escolher'}{start ? ' · ' + formatTime(start, timezone) : ''}</p></div></div>
        {service && (
          <div className="border-t border-white/10 pt-4 flex items-end justify-between gap-4">
            <div>
              <p className="t-label text-ink-mid">Preço</p>
              <p className="t-card text-ink-hi mt-1">{formatMT(service.price_cents)}</p>
              {depositCents > 0 && depositConfigValid && <p className="t-label text-ink-mid mt-1">Sinal: {formatMT(depositCents)}</p>}
              {depositCents > 0 && !depositConfigValid && <p className="t-label text-st-noshow mt-1">Configuração do sinal inválida.</p>}
            </div>
            <span className="t-label text-ink-mid">{service.duration_min} min</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function BookingWizard() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = usePublicBarbershop(slug);
  const data = query.data;
  const [form, setForm] = useState<CustomerForm>({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bookingError, setBookingError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const rawStep = Number(searchParams.get('step') ?? '1');
  const currentStep = Number.isFinite(rawStep) ? Math.min(6, Math.max(1, Math.round(rawStep))) : 1;
  const serviceId = searchParams.get('service');
  const haircutId = searchParams.get('haircut');
  const barberParam = searchParams.get('barber') ?? 'any';
  const date = searchParams.get('date');
  const start = searchParams.get('start');

  const service = data?.services.find((item) => item.id === serviceId);
  const haircut = data?.haircuts.find((item) => item.id === haircutId);
  const eligibleHaircuts = useMemo(
    () => data?.haircuts.filter((item) => !item.service_id || item.service_id === serviceId) ?? [],
    [data?.haircuts, serviceId],
  );
  const eligibleBarbers = useMemo(
    () => data?.barbers.filter((barber) => Boolean(serviceId && barber.service_ids.includes(serviceId))) ?? [],
    [data?.barbers, serviceId],
  );
  const barber = data?.barbers.find((item) => item.id === barberParam);
  const selectedBarberId = barberParam === 'any' ? null : barber?.id ?? null;
  const selectableService = service && eligibleBarbers.length ? service : undefined;

  const today = data ? todayInZone(data.shop.timezone) : null;
  const maxDate = data && today ? addDaysISO(today, data.shop.max_advance_days) : null;
  const daysQuery = useAvailableDays({
    slug,
    serviceId: service?.id,
    barberId: selectedBarberId,
    from: today ?? undefined,
    to: maxDate ?? undefined,
  });
  const slotsQuery = useAvailableSlots({
    slug,
    serviceId: service?.id,
    barberId: selectedBarberId,
    date: date ?? undefined,
  });
  const bookMutation = useBookAppointment();

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  useEffect(() => {
    if (!data || !serviceId) return;
    if (!service) {
      updateSearchParams(searchParams, setSearchParams, { step: '1', service: null, haircut: null, barber: null, date: null, start: null });
    }
  }, [data, serviceId, service, searchParams, setSearchParams]);

  useEffect(() => {
    if (!data || !haircutId || !serviceId || !service) return;
    if (!eligibleHaircuts.some((item) => item.id === haircutId)) {
      updateSearchParams(searchParams, setSearchParams, { step: '2', haircut: null, barber: 'any', date: null, start: null });
    }
  }, [data, haircutId, serviceId, service, eligibleHaircuts, searchParams, setSearchParams]);

  useEffect(() => {
    if (!data || barberParam === 'any' || !service) return;
    if (!barber) {
      updateSearchParams(searchParams, setSearchParams, { step: '3', barber: 'any', date: null, start: null });
    }
  }, [data, barberParam, barber, service, searchParams, setSearchParams]);

  useEffect(() => {
    if (!date || !today || !maxDate) return;
    if (date < today || date > maxDate) {
      updateSearchParams(searchParams, setSearchParams, { step: '4', date: null, start: null });
    }
  }, [date, today, maxDate, searchParams, setSearchParams]);

  useEffect(() => {
    if (!service || !date || !start || !slotsQuery.data) return;
    if (!slotsQuery.data.some((slot) => slot.slot_start === start)) {
      updateSearchParams(searchParams, setSearchParams, { step: '5', start: null });
    }
  }, [service, date, start, slotsQuery.data, searchParams, setSearchParams]);

  if (query.isLoading) {
    return (
      <div className="min-h-screen px-5 py-6 sm:px-8">
        <div className="max-w-6xl mx-auto"><Skeleton className="h-20" lines={3} /><div className="mt-6 grid lg:grid-cols-[1fr_22rem] gap-6"><Skeleton className="h-[32rem]" lines={8} /><Skeleton className="h-80" lines={7} /></div></div>
      </div>
    );
  }

  if (query.error || !data) {
    return <div className="min-h-screen px-5 py-10 grid place-items-center"><div className="w-full max-w-lg"><ErrorState message={humanError(query.error ?? new Error('BARBERSHOP_NOT_FOUND'))} onRetry={() => query.refetch()} /></div></div>;
  }

  const effectiveStep = !selectableService ? 1 : Math.min(currentStep, start ? 6 : date ? 5 : 4);
  const depositCents = service ? getDepositCents(service, data.shop) : 0;
  const depositConfigValid = !service || depositCents <= service.price_cents;
  const canBook = Boolean(selectableService && start && (barberParam === 'any' || barber) && depositConfigValid);

  const setStep = (step: number) => updateSearchParams(searchParams, setSearchParams, { step: String(step) });

  const chooseService = (id: string) => updateSearchParams(searchParams, setSearchParams, {
    service: id, haircut: null, barber: 'any', date: null, start: null, step: '2',
  });

  const chooseHaircut = (id: string | null) => updateSearchParams(searchParams, setSearchParams, {
    haircut: id, step: '3',
  });

  const chooseBarber = (id: string | null) => updateSearchParams(searchParams, setSearchParams, {
    barber: id ?? 'any', date: null, start: null, step: '4',
  });

  const chooseDate = (value: string) => updateSearchParams(searchParams, setSearchParams, {
    date: value, start: null, step: '5',
  });

  const chooseStart = (value: string) => updateSearchParams(searchParams, setSearchParams, {
    start: value, step: '6',
  });

  const goBack = () => {
    const previous = effectiveStep - 1;
    if (previous < 1) {
      navigate(`/barbearia/${slug ?? ''}`);
      return;
    }
    setStep(previous);
  };

  const goNext = () => {
    setBookingError(null);
    if (effectiveStep === 1 && !selectableService) return;
    if (effectiveStep === 2) {
      setStep(3);
      return;
    }
    if (effectiveStep === 3) {
      setStep(4);
      return;
    }
    if (effectiveStep === 4 && date) {
      setStep(5);
      return;
    }
    if (effectiveStep === 5 && start) {
      setStep(6);
      return;
    }
    if (effectiveStep === 6) void submitBooking();
  };

  const submitBooking = async () => {
    if (!canBook || !slug || !selectableService || !start) return;

    const nextErrors: Record<string, string> = {};
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (name.length < 2 || name.length > 120) nextErrors.name = 'Escreve o teu nome (2 a 120 caracteres).';
    if (!validMozPhone(phone)) nextErrors.phone = 'Usa um número móvel de Moçambique, por exemplo 84 000 0000.';
    if (!validEmail(email)) nextErrors.email = 'Indica um email válido.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBookingError(null);
    try {
      const result = await bookMutation.mutateAsync({
        p_slug: slug,
        p_service_id: selectableService.id,
        p_haircut_id: haircut?.id ?? null,
        p_barber_id: selectedBarberId,
        p_start: start,
        p_name: name,
        p_phone: normalizeMozPhone(phone),
        p_email: email || null,
      });
      navigate(`/marcacao/${result.manage_token}`, { replace: true });
    } catch (error) {
      const message = String(error).includes('SLOT_TAKEN') || String(error).includes('SLOT_UNAVAILABLE')
        ? 'Esse horário acabou de ser ocupado. Escolhe outro horário.'
        : humanError(error);
      setBookingError(message);
      if (String(error).includes('SLOT_TAKEN') || String(error).includes('SLOT_UNAVAILABLE')) {
        updateSearchParams(searchParams, setSearchParams, { step: '5', start: null });
        await slotsQuery.refetch();
      }
    }
  };

  const showServiceStep = effectiveStep === 1;
  const showHaircutStep = effectiveStep === 2;
  const showBarberStep = effectiveStep === 3;
  const showDateStep = effectiveStep === 4;
  const showTimeStep = effectiveStep === 5;
  const showCustomerStep = effectiveStep === 6;

  return (
    <div className="min-h-screen">
      <header className="max-w-6xl mx-auto px-5 sm:px-8 py-5">
        <StepHeader currentStep={effectiveStep} shopName={data.shop.name} />
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 pb-28 lg:pb-16">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
          <section>
            {showServiceStep && (
              <Panel title="Escolha o serviço" testId="booking-step-service">
                {data.services.length ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {data.services.map((item) => {
                      const bookable = data.barbers.some((barberItem) => barberItem.service_ids.includes(item.id));
                      return (
                        <ChoiceCard
                          key={item.id}
                          title={item.name}
                          body={bookable ? null : 'Sem barbeiro disponível para este serviço.'}
                          meta={formatMT(item.price_cents) + ' · ' + item.duration_min + ' min'}
                          selected={item.id === service?.id && bookable}
                          disabled={!bookable}
                          onClick={() => { if (bookable) chooseService(item.id); }}
                          testId={`booking-service-${item.id}`}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="Marcação online indisponível" body="Esta barbearia ainda não publicou serviços activos." />
                )}
              </Panel>
            )}

            {showHaircutStep && service && (
              <Panel title="Escolha o corte" testId="booking-step-haircut">
                {eligibleHaircuts.length ? (
                  <div className="space-y-3">
                    <ChoiceCard
                      title="Sem preferência"
                      body="Deixa o barbeiro orientar o acabamento para o serviço escolhido."
                      selected={!haircutId}
                      onClick={() => chooseHaircut(null)}
                      testId="booking-haircut-any"
                    />
                    <div className="grid sm:grid-cols-2 gap-3">
                      {eligibleHaircuts.map((item) => (
                        <ChoiceCard
                          key={item.id}
                          title={item.name}
                          body={item.description}
                          meta={item.price_cents != null ? formatMT(item.price_cents) : item.duration_min != null ? item.duration_min + ' min' : undefined}
                          selected={item.id === haircutId}
                          onClick={() => chooseHaircut(item.id)}
                          testId={`booking-haircut-${item.id}`}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="Sem cortes configurados" body="Pode continuar sem especificar um corte." action={<Button variant="secondary" onClick={() => chooseHaircut(null)}>Continuar</Button>} />
                )}
              </Panel>
            )}

            {showBarberStep && service && (
              <Panel title="Escolha o barbeiro" testId="booking-step-barber">
                <div className="space-y-3">
                  <ChoiceCard
                    title="Qualquer barbeiro"
                    body="O sistema escolhe automaticamente um barbeiro elegível quando a marcação for criada."
                    selected={barberParam === 'any'}
                    onClick={() => chooseBarber(null)}
                    testId="booking-barber-any"
                  />
                  {eligibleBarbers.map((item) => (
                    <BarberChoice key={item.id} barber={item} selected={item.id === barber?.id} onClick={() => chooseBarber(item.id)} />
                  ))}
                </div>
                {!eligibleBarbers.length && <EmptyState title="Sem barbeiros para este serviço" body="Este serviço ainda não está associado a nenhum barbeiro disponível." />}
              </Panel>
            )}

            {showDateStep && service && (
              <Panel title="Escolha o dia" testId="booking-step-date">
                {daysQuery.isLoading ? (
                  <Skeleton className="h-72" lines={7} />
                ) : daysQuery.error ? (
                  <ErrorState message={humanError(daysQuery.error)} onRetry={() => daysQuery.refetch()} />
                ) : daysQuery.data?.length ? (
                  <div>
                    <p className="t-body text-ink-mid mb-4">Escolha um dia com vagas reais. Dias sem slots permanecem desactivados.</p>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2" role="listbox" aria-label="Dias disponíveis">
                      {daysQuery.data.map((day) => {
                        const active = day.day === date;
                        const available = day.slots_count > 0;
                        return (
                          <button
                            key={day.day}
                            type="button"
                            role="option"
                            aria-selected={active}
                            aria-disabled={!available}
                            disabled={!available}
                            onClick={() => chooseDate(day.day)}
                            className={`rounded-2xl border px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${active ? 'border-accent-soft bg-accent-soft/15' : available ? 'border-white/10 bg-white/5 hover:bg-white/[.07]' : 'border-white/5 bg-white/[.02] opacity-45'}`}
                          >
                            <span className="t-label text-ink-mid block">{WEEKDAYS_SHORT[new Date(day.day + 'T00:00:00Z').getUTCDay()]}</span>
                            <span className="block text-lg text-ink-hi mt-1">{day.day.slice(8, 10)}</span>
                            <span className="t-label text-ink-mid block mt-1">{available ? day.slots_count + (day.slots_count === 1 ? ' vaga' : ' vagas') : 'Sem vagas'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : <EmptyState title="Sem dias disponíveis" body="Não existem vagas nesta janela para a combinação escolhida." />}
              </Panel>
            )}

            {showTimeStep && service && date && (
              <Panel title="Escolha a hora" testId="booking-step-time">
                {slotsQuery.isLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2"><Skeleton className="h-32" lines={5} /><Skeleton className="h-32" lines={5} /></div>
                ) : slotsQuery.error ? (
                  <ErrorState message={humanError(slotsQuery.error)} onRetry={() => slotsQuery.refetch()} />
                ) : slotsQuery.data?.length ? (
                  <div>
                    <p className="t-body text-ink-mid mb-4">{formatDate(date, data.shop.timezone, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="listbox" aria-label="Horas disponíveis">
                      {slotsQuery.data.map((slot) => (
                        <button
                          key={slot.slot_start}
                          type="button"
                          role="option"
                          aria-selected={slot.slot_start === start}
                          onClick={() => chooseStart(slot.slot_start)}
                          className={`h-12 rounded-2xl border t-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${slot.slot_start === start ? 'border-accent-soft bg-accent-soft/15 text-ink-hi' : 'border-white/10 bg-white/5 text-ink-hi hover:bg-white/[.07]'}`}
                        >
                          {formatTime(slot.slot_start, data.shop.timezone)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : <EmptyState title="Este dia ficou sem vagas" body="A disponibilidade mudou. Volte ao dia anterior e escolha outra data." action={<Button variant="secondary" onClick={() => setStep(4)}>Escolher outro dia</Button>} />}
              </Panel>
            )}

            {showCustomerStep && service && start && (
              <Panel title="Os seus dados" testId="booking-step-customer">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitBooking();
                  }}
                  className="space-y-5"
                  noValidate
                >
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field
                      label="Nome"
                      name="name"
                      autoComplete="name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      error={errors.name}
                      placeholder="Nome completo"
                      required
                    />
                    <Field
                      label="Telefone"
                      name="phone"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      error={errors.phone}
                      hint="Ex.: 84 000 0000"
                      placeholder="84 000 0000"
                      required
                    />
                  </div>
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    error={errors.email}
                    hint="Opcional. Usado para confirmações quando disponível."
                    placeholder="nome@email.com"
                  />
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="t-body text-ink-mid">Sem conta e sem palavra-passe. A sua marcação ficará acessível através do link de gestão enviado após a criação.</p>
                  </div>
                  {bookingError && <div aria-live="assertive"><ErrorState message={bookingError} /></div>}
                  <Button
                    type="submit"
                    full
                    size="lg"
                    loading={bookMutation.isPending}
                    disabled={!canBook}
                    data-testid="booking-submit"
                  >
                    {depositCents > 0 ? 'Criar marcação com sinal' : 'Confirmar marcação'}
                  </Button>
                </form>
              </Panel>
            )}

            <div
              ref={headingRef}
              tabIndex={-1}
              className="sr-only"
              aria-live="polite"
            >
              Passo {effectiveStep}: {STEP_LABELS[effectiveStep - 1]}
            </div>
          </section>

          <aside className="lg:sticky lg:top-6">
            <Summary
              shopName={data.shop.name}
              service={selectableService}
              haircut={haircut}
              barber={barber}
              date={date}
              start={start}
              timezone={data.shop.timezone}
              depositCents={depositCents}
              depositConfigValid={depositConfigValid}
            />
          </aside>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/85 backdrop-blur-xl lg:static lg:bg-transparent lg:border-0">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-3 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={goBack} disabled={bookMutation.isPending} aria-label="Voltar um passo">
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            {currentStep === 6 && data.shop.whatsapp && (
              <a
                href={buildWhatsAppLink(data.shop.whatsapp, 'Olá, preciso de ajuda para fazer uma marcação na ' + data.shop.name + '.')}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex h-11 px-4 items-center justify-center gap-2 rounded-2xl text-sm text-ink-mid hover:text-ink-hi hover:bg-white/5"
              >
                <MessageCircle size={16} />
                Ajuda
              </a>
            )}
            <Button
              type="button"
              onClick={goNext}
              disabled={
                bookMutation.isPending ||
                (effectiveStep === 1 && !service) ||
                (effectiveStep === 3 && !eligibleBarbers.length) ||
                (effectiveStep === 4 && !date) ||
                (effectiveStep === 5 && !start) ||
                (effectiveStep === 6 && !canBook)
              }
              loading={effectiveStep === 6 && bookMutation.isPending}
              data-testid="booking-next"
            >
              {effectiveStep === 6 ? 'Confirmar' : 'Continuar'}
              {effectiveStep < 6 && <ArrowRight size={16} />}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
