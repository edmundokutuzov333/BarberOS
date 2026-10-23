import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock3, Mail, MessageCircle, Scissors, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useScopedTheme } from '@/themes';
import { BARBER_FALLBACK_PHOTOS, SERVICE_FALLBACK_PHOTOS, PhotoWithFallback } from '@/components/PhotoWithFallback';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Field } from '@/components/ui/Field';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { buildWhatsAppLink } from '@/lib/calendar';
import { formatMT, humanError } from '@/lib/utils';
import { useAvailableDays, useAvailableSlots } from '@/features/availability/api';
import { normalizeMozPhone, useBookAppointment } from '@/features/booking/api';
import { HaircutPhoto } from '@/components/HaircutPhoto';
import { rememberLocalBooking } from '@/lib/shop-link';
import { WaitlistJoinPanel } from '@/features/waitlist/WaitlistJoinPanel';
import {
  usePublicBarbershop,
  type PublicBarber,
  type PublicHaircut,
  type PublicService,
} from '@/features/public-shop/api';
import { usePublicShopCatalog, type PublicShopProduct, type PublicShopVariant } from '@/features/public-shop/catalog';
import { ShopCatalogueStep, type ShopCart } from '@/features/public-shop/CatalogueStep';

const STEP_LABELS = ['Serviço', 'Corte', 'Barbeiro', 'Data', 'Hora', 'Dados'];

type SelectedShopLine = {
  product: PublicShopProduct;
  variant: PublicShopVariant;
  qty: number;
  options: string[];
  fulfilmentMode: 'consume_here' | 'takeaway';
};

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
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function StepHeader({ currentStep, shopName, shopSlug, stepLabels }: { currentStep: number; shopName: string; shopSlug: string; stepLabels: string[] }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to={`/barbearia/${shopSlug}`} className="t-label text-ink-mid hover:text-ink-hi transition-colors">{shopName}</Link>
          <p className="t-label text-accent-soft mt-1">Marcação online</p>
        </div>
        <span className="t-label text-ink-mid">{currentStep} de {stepLabels.length}</span>
      </div>
      <nav aria-label="Progresso da marcação" className="mt-5">
        <ol className={'grid gap-1.5 ' + (stepLabels.length === 7 ? 'grid-cols-7' : 'grid-cols-6')}>
          {stepLabels.map((label, index) => {
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
  imageName,
  imageUrl,
  imageAlt,
  imageFallbackSources,
}: {
  title: string;
  body?: string | null;
  meta?: string;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  imageName?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  imageFallbackSources?: string[];
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
      {(imageName || imageUrl) && (imageFallbackSources
        ? <PhotoWithFallback src={imageUrl} fallbackSources={imageFallbackSources} alt={imageAlt ?? "Fotografia de referência para " + (imageName ?? title)} className="mb-4 w-full aspect-[16/9] rounded-2xl object-cover bg-[var(--surface-2)]" loading="lazy" decoding="async" />
        : <HaircutPhoto name={imageName ?? title} photoUrl={imageUrl} alt={imageAlt ?? "Fotografia de referência para " + (imageName ?? title)} className="mb-4 w-full aspect-[16/9] rounded-2xl object-cover bg-[var(--surface-2)]" />)}
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
        <PhotoWithFallback src={barber.photo_url} fallbackSources={BARBER_FALLBACK_PHOTOS} alt="Fotografia de referência de barbeiro" className="h-14 w-14 rounded-2xl object-cover" />
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
  shopFeatureActive,
  shopLines,
  shopSubtotal,
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
  shopFeatureActive: boolean;
  shopLines: { product: PublicShopProduct; variant: PublicShopVariant; qty: number; options: string[]; fulfilmentMode: 'consume_here' | 'takeaway' }[];
  shopSubtotal: number;
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
        {shopFeatureActive && shopLines.length > 0 && (
          <div className="border-t border-white/10 pt-4 space-y-3" data-testid="booking-shop-summary">
            <p className="t-label text-ink-mid">Artigos seleccionados</p>
            <ul className="space-y-2">
              {shopLines.map((line) => (
                <li key={line.variant.id} className="text-sm">
                  <div className="flex justify-between gap-3"><span className="text-ink-mid">{line.qty} × {line.product.name} · {line.variant.label}</span><span className="text-ink-hi tabular-nums">{formatMT(line.qty * line.variant.price_minor)}</span></div>
                  <p className="t-label text-ink-mid mt-1">{line.fulfilmentMode === 'consume_here' ? 'Consumir na barbearia' : 'Levar consigo'}</p>
                  {line.options.length > 0 && <p className="t-label text-ink-mid mt-1">Preferências: {line.options.join(', ')}</p>}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-white/10 pt-3 gap-3"><span className="t-label text-ink-mid">Subtotal dos produtos</span><span className="t-card text-ink-hi tabular-nums">{formatMT(shopSubtotal)}</span></div>
            <p className="t-label text-ink-mid">Separado do preço do serviço. A selecção ainda não é um pedido confirmado.</p>
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
  const shopCatalogQuery = usePublicShopCatalog(slug);
  const data = query.data;

  // Tenant colours are scoped to this route and restored on exit.
  useScopedTheme(data?.shop.theme_key);

  const [form, setForm] = useState<CustomerForm>({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingAttemptKey, setBookingAttemptKey] = useState(() => crypto.randomUUID());
  const bookingAttemptFingerprint = useRef<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [shopCart, setShopCart] = useState<ShopCart>({});
  useEffect(() => { setShopCart({}); setBookingError(null); setBookingAttemptKey(crypto.randomUUID()); bookingAttemptFingerprint.current = null; }, [slug]);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';
  const turnstileRequired = import.meta.env.VITE_BOOKING_TURNSTILE_REQUIRED === 'true' || import.meta.env.PROD;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const shopStepAvailable = shopCatalogQuery.data?.enabled === true;
  const customerStep = shopStepAvailable ? 7 : 6;
  const stepLabels = shopStepAvailable ? [...STEP_LABELS.slice(0, 5), 'Loja', 'Dados'] : STEP_LABELS;
  const rawStep = Number(searchParams.get('step') ?? '1');
  const currentStep = Number.isFinite(rawStep) ? Math.min(customerStep, Math.max(1, Math.round(rawStep))) : 1;
  const serviceId = searchParams.get('service');
  const haircutId = searchParams.get('haircut');
  const barberParam = searchParams.get('barber') ?? 'any';
  const date = searchParams.get('date');
  const start = searchParams.get('start');
  const shopLines: SelectedShopLine[] = useMemo(() => (shopCatalogQuery.data?.products ?? []).flatMap((product) => product.variants.flatMap((variant) => {
    const selected = shopCart[variant.id];
    return selected?.qty > 0 ? [{ product, variant, qty: selected.qty, options: selected.options, fulfilmentMode: selected.fulfilmentMode }] : [];
  })), [shopCatalogQuery.data?.products, shopCart]);
  const shopItemCount = shopLines.reduce((total, line) => total + line.qty, 0);
  const shopSubtotal = shopLines.reduce((total, line) => total + line.qty * line.variant.price_minor, 0);

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
      <div className="barber-shell min-h-screen px-5 py-6 sm:px-8">
        
        <div className="max-w-6xl mx-auto"><Skeleton className="h-20" lines={3} /><div className="mt-6 grid lg:grid-cols-[1fr_22rem] gap-6"><Skeleton className="h-[32rem]" lines={8} /><Skeleton className="h-80" lines={7} /></div></div>
      </div>
    );
  }

  if (query.error || !data) {
    return <div className="barber-shell min-h-screen px-5 py-10 grid place-items-center">
        <div className="w-full max-w-lg"><ErrorState message={humanError(query.error ?? new Error('BARBERSHOP_NOT_FOUND'))} onRetry={() => query.refetch()} /></div></div>;
  }

  const effectiveStep = !selectableService ? 1 : Math.min(currentStep, start ? customerStep : date ? 5 : 4);
  const depositCents = service ? getDepositCents(service, data.shop) : 0;
  const depositConfigValid = !service || depositCents <= service.price_cents;
  const canBook = Boolean(
    !shopCatalogQuery.isLoading && selectableService && start && (barberParam === 'any' || barber) && depositConfigValid &&
    ((!turnstileRequired && !turnstileSiteKey) || Boolean(turnstileSiteKey && turnstileToken)) &&
    shopLines.length <= 20,
  );

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

  const changeShopQuantity = (product: PublicShopProduct, variant: PublicShopVariant, delta: number) => {
    const selectedVariantCount = Object.values(shopCart).filter((line) => line.qty > 0).length;
    if (delta > 0 && !shopCart[variant.id] && selectedVariantCount >= 20) {
      setBookingError('Pode seleccionar até 20 variantes diferentes por marcação. Retire um artigo antes de adicionar outro.');
      return;
    }
    setShopCart((current) => {
      const previous = current[variant.id] ?? {
        qty: 0,
        options: [],
        fulfilmentMode: product.product_kind === 'takeaway' ? 'takeaway' as const : 'consume_here' as const,
      };
      const qty = Math.max(0, Math.min(100, previous.qty + delta));
      const next = { ...current };
      if (qty === 0) delete next[variant.id];
      else next[variant.id] = {
        ...previous,
        qty,
        options: previous.options.filter((option) => product.order_options.includes(option)),
        fulfilmentMode: product.product_kind === 'takeaway' ? 'takeaway' : product.product_kind === 'consume_here' ? 'consume_here' : previous.fulfilmentMode,
      };
      return next;
    });
    setBookingError(null);
  };

  const changeShopOption = (variantId: string, option: string, checked: boolean) => {
    setShopCart((current) => {
      const previous = current[variantId];
      if (!previous || previous.qty === 0) return current;
      const options = checked ? [...new Set([...previous.options, option])] : previous.options.filter((item) => item !== option);
      return { ...current, [variantId]: { ...previous, options: options.slice(0, 10) } };
    });
    setBookingError(null);
  };

  const changeShopFulfilmentMode = (variantId: string, mode: 'consume_here' | 'takeaway') => {
    setShopCart((current) => {
      const previous = current[variantId];
      if (!previous || previous.qty === 0) return current;
      return { ...current, [variantId]: { ...previous, fulfilmentMode: mode } };
    });
    setBookingError(null);
  };

  const continueWithoutProducts = () => {
    setShopCart({});
    setBookingError(null);
    setStep(customerStep);
  };

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
    if (shopStepAvailable && effectiveStep === 6) {
      setStep(7);
      return;
    }
    if (effectiveStep === customerStep) void submitBooking();
  };

  const submitBooking = async () => {
    if ((turnstileRequired || turnstileSiteKey) && !turnstileSiteKey) {
      setBookingError('A marcação está temporariamente indisponível porque a verificação de segurança não está configurada.');
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setBookingError('Conclua a verificação de segurança antes de confirmar a marcação.');
      return;
    }
    if (!canBook || !slug || !selectableService || !start) return;

    const nextErrors: Record<string, string> = {};
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (name.length < 2 || name.length > 120) nextErrors.name = 'Escreve o teu nome (2 a 120 caracteres).';
    if (!validMozPhone(phone)) nextErrors.phone = 'Usa um número móvel de Moçambique, por exemplo 84 000 0000.';
    if (email && !validEmail(email)) nextErrors.email = 'Indica um email válido.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const shopItems = shopLines.map((line) => ({
      variant_id: line.variant.id,
      qty: line.qty,
      options: line.options,
      fulfilment_mode: line.fulfilmentMode,
    }));
    const requestFingerprint = JSON.stringify({
      slug: slug?.trim().toLowerCase(),
      service: selectableService.id,
      haircut: haircut?.id ?? null,
      barber: selectedBarberId,
      start,
      name,
      phone: normalizeMozPhone(phone),
      email: email || null,
      shopItems,
    });
    let requestKey = bookingAttemptKey;
    if (bookingAttemptFingerprint.current !== requestFingerprint) {
      requestKey = crypto.randomUUID();
      bookingAttemptFingerprint.current = requestFingerprint;
      setBookingAttemptKey(requestKey);
    }

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
        p_shop_items: shopItems,
        idempotency_key: requestKey,
        ...(turnstileSiteKey ? { turnstile_token: turnstileToken ?? undefined } : {}),
      });
      rememberLocalBooking({ token: result.manage_token, shopSlug: slug, startsAt: start, serviceName: selectableService.name });
      navigate(`/marcacao/${result.manage_token}`, { replace: true });
      bookingAttemptFingerprint.current = null;
      setBookingAttemptKey(crypto.randomUUID());
      bookingAttemptFingerprint.current = null;
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : String(error);
      if (errorCode === 'IDEMPOTENCY_KEY_REUSED') {
        bookingAttemptFingerprint.current = null;
        setBookingAttemptKey(crypto.randomUUID());
      }
      const message = errorCode.includes('SLOT_TAKEN') || errorCode.includes('SLOT_UNAVAILABLE')
        ? 'Este horário acabou de ser ocupado. Escolha outro horário.'
        : errorCode === 'BOT_CHECK_FAILED'
          ? 'A verificação de segurança expirou ou não foi aceite. Verifique novamente.'
          : errorCode === 'RATE_LIMITED'
            ? 'Foram feitas demasiadas tentativas. Aguarde alguns minutos e tente novamente.'
            : errorCode === 'IDEMPOTENCY_IN_PROGRESS'
              ? 'Esta tentativa ainda está a ser processada. Aguarde um momento antes de tentar novamente.'
              : errorCode === 'IDEMPOTENCY_STORE_UNAVAILABLE'
                ? 'Não foi possível confirmar o estado da marcação. Aguarde e, se o erro persistir, contacte o suporte.'
                : errorCode === 'SHOP_STOCK_UNAVAILABLE' || errorCode === 'SHOP_ITEM_UNAVAILABLE'
                  ? 'Um dos artigos deixou de estar disponível. Volte à Loja, reveja a selecção e confirme novamente.'
                  : errorCode === 'IDEMPOTENCY_KEY_REUSED'
                    ? 'A selecção mudou desde a última tentativa. Confirme novamente para continuar com os dados actuais.'
                    : humanError(error);
      setBookingError(message);
      if (turnstileSiteKey) {
        setTurnstileToken(null);
        setTurnstileResetKey((value) => value + 1);
      }
      if (errorCode.includes('SLOT_TAKEN') || errorCode.includes('SLOT_UNAVAILABLE')) {
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
  const showShopStep = shopStepAvailable && effectiveStep === 6;
  const showCustomerStep = effectiveStep === customerStep;

  return (
    <div className="barber-shell min-h-screen">
      
      <header className="max-w-6xl mx-auto px-5 sm:px-8 py-5">
        <StepHeader currentStep={effectiveStep} shopName={data.shop.name} shopSlug={data.shop.slug} stepLabels={stepLabels} />
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
                          imageName={item.name}
                          imageUrl={item.photo_url}
                          imageAlt={`Fotografia de referência para ${item.name}`}
                          imageFallbackSources={SERVICE_FALLBACK_PHOTOS}
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
                          imageName={item.name}
                          imageUrl={item.photo_url}
                          imageAlt={`Fotografia de referência para ${item.name}`}
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
                ) : (
                  <div className="space-y-4">
                    <EmptyState
                      title="Este dia ficou sem vagas"
                      body="A disponibilidade mudou. Pode escolher outro dia ou entrar na lista de espera."
                      action={<Button variant="secondary" onClick={() => setStep(4)}>Escolher outro dia</Button>}
                    />
                    {slotsQuery.isSuccess && slotsQuery.data?.length === 0 && today && maxDate && (
                      <WaitlistJoinPanel
                        slug={slug!}
                        serviceId={service.id}
                        haircutId={haircut?.id ?? null}
                        barberId={selectedBarberId}
                        date={date}
                        maxDate={maxDate}
                      />
                    )}
                  </div>
                )}
              </Panel>
            )}

            {showShopStep && shopCatalogQuery.data && (
              <ShopCatalogueStep
                catalog={shopCatalogQuery.data}
                cart={shopCart}
                loading={shopCatalogQuery.isLoading}
                error={shopCatalogQuery.isError ? shopCatalogQuery.error : undefined}
                onRetry={() => { void shopCatalogQuery.refetch(); }}
                onQuantityChange={changeShopQuantity}
                onOptionChange={changeShopOption}
                onFulfilmentModeChange={changeShopFulfilmentMode}
                onContinueWithoutProducts={continueWithoutProducts}
              />
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
                    label="Email (opcional)"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    error={errors.email}
                    hint="Opcional. As notificações por email dependem da configuração da barbearia."
                    placeholder="nome@email.com"
                  />
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="t-body text-ink-mid">Não precisa de criar conta. O email é opcional. Guarde o link de gestão apresentado no ecrã após confirmar; as notificações por email dependem da configuração da barbearia.</p>
                  </div>
                  {turnstileSiteKey ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <p className="t-label text-ink-mid">Confirme que é uma pessoa antes de finalizar.</p>
                      <TurnstileWidget
                        key={turnstileResetKey}
                        siteKey={turnstileSiteKey}
                        onTokenChange={setTurnstileToken}
                      />
                    </div>
                  ) : turnstileRequired ? (
                    <div role="alert" className="rounded-2xl border border-st-noshow/30 bg-st-noshow/10 p-4">
                      <p className="t-label text-st-noshow">
                        A verificação de segurança não está configurada. As marcações estão temporariamente bloqueadas.
                      </p>
                    </div>
                  ) : null}
                  {shopStepAvailable && shopItemCount > 0 && (
                    <div role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="booking-shop-order-summary">
                      <p className="t-body text-ink-mid">Os artigos serão registados como pedido associado à marcação. O pagamento não é efectuado nesta etapa; a equipa confirma a disponibilidade e a preparação.</p>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setStep(6)} className="mt-3">Voltar à Loja para rever artigos</Button>
                    </div>
                  )}
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
              Passo {effectiveStep}: {stepLabels[effectiveStep - 1]}
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
              shopFeatureActive={shopStepAvailable}
              shopLines={shopLines}
              shopSubtotal={shopSubtotal}
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
            {effectiveStep === customerStep && data.shop.whatsapp && (
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
                (effectiveStep === customerStep && !canBook)
              }
              loading={effectiveStep === customerStep && bookMutation.isPending}
              data-testid="booking-next"
            >
              {effectiveStep === customerStep ? 'Confirmar' : 'Continuar'}
              {effectiveStep < customerStep && <ArrowRight size={16} />}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
