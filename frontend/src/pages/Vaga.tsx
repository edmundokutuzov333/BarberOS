import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, MessageCircle, Scissors, UserRound, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { buildWhatsAppLink } from '@/lib/calendar';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { useClaimWaitlistOffer, useExpireWaitlistOffer, useWaitlistOffer } from '@/features/waitlist/api';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function remainingMs(value: string | null | undefined): number {
  if (!value) return 0;
  return Math.max(0, new Date(value).getTime() - Date.now());
}

function countdown(value: string | null | undefined): string {
  const ms = remainingMs(value);
  if (!ms) return 'Expirada';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
}

function formatOfferDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatOfferTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export default function Vaga() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const offer = useWaitlistOffer(token);
  const claim = useClaimWaitlistOffer();
  const expire = useExpireWaitlistOffer();
  const [tick, setTick] = useState(Date.now());
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (!token || !TOKEN_PATTERN.test(token)) return;
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!offer.data || offer.data.status !== 'offered' || offer.data.can_claim || rotating || !token) return;
    setRotating(true);
    expire.mutate(token, {
      onSettled: async () => {
        await offer.refetch();
        setRotating(false);
      },
    });
  }, [offer.data?.status, offer.data?.can_claim, token, rotating]);

  const remaining = useMemo(() => countdown(offer.data?.offer_expires_at), [offer.data?.offer_expires_at, tick]);

  if (!token || !TOKEN_PATTERN.test(token)) {
    return (
      <div className="min-h-screen px-5 py-8 sm:px-8 grid place-items-center">
        <div className="w-full max-w-lg"><ErrorState message="Esta oferta não é válida." /></div>
      </div>
    );
  }

  if (offer.isLoading) {
    return (
      <div className="min-h-screen px-5 py-8 sm:px-8">
        <header className="max-w-3xl mx-auto h-16 flex items-center"><Brand /></header>
        <main className="max-w-3xl mx-auto pt-10 space-y-4"><Skeleton className="h-28" /><Skeleton className="h-80" /></main>
      </div>
    );
  }

  if (offer.error || !offer.data) {
    return (
      <div className="min-h-screen px-5 py-8 sm:px-8">
        <header className="max-w-3xl mx-auto h-16 flex items-center"><Brand /></header>
        <main className="max-w-3xl mx-auto pt-10"><ErrorState message={humanError(offer.error ?? new Error('WAITLIST_OFFER_NOT_FOUND'))} onRetry={() => void offer.refetch()} /></main>
      </div>
    );
  }

  const data = offer.data;
  const expired = data.status === 'offered' && !data.can_claim;
  const claimed = data.status === 'converted';
  const inactive = data.status === 'cancelled' || data.status === 'expired';

  const accept = async () => {
    try {
      const result = await claim.mutateAsync(token);
      toast.success('Vaga confirmada. A sua marcação está criada.');
      navigate('/marcacao/' + result.manage_token, { replace: true });
    } catch (error) {
      toast.error(humanError(error));
      if (String(error).includes('WAITLIST_SLOT_TAKEN') || String(error).includes('WAITLIST_OFFER_EXPIRED')) {
        await offer.refetch();
      }
    }
  };

  return (
    <div className="min-h-screen px-5 py-8 sm:px-8">
      <header className="max-w-3xl mx-auto h-16 flex items-center justify-between gap-4">
        <Brand />
        <span className="t-label text-ink-mid">BarberOS by Oryon</span>
      </header>

      <main className="max-w-3xl mx-auto pt-8 pb-16">
        <div className="mb-6">
          <p className="t-label text-accent-soft">VAGA LIBERTADA</p>
          <h1 className="t-title text-ink-hi mt-2">Há uma vaga para si</h1>
          <p className="t-body text-ink-mid mt-1">Esta oportunidade foi reservada temporariamente enquanto decide.</p>
        </div>

        {claimed ? (
          <Panel testId="waitlist-claimed">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={22} className="text-st-done mt-0.5" />
              <div>
                <p className="t-card text-ink-hi">Esta vaga já foi convertida</p>
                <p className="t-body text-ink-mid mt-1">A marcação associada a esta oferta já foi criada.</p>
              </div>
            </div>
          </Panel>
        ) : inactive || expired ? (
          <Panel testId="waitlist-expired">
            <div className="flex items-start gap-3">
              <XCircle size={22} className="text-st-noshow mt-0.5" />
              <div>
                <p className="t-card text-ink-hi">{rotating ? 'A procurar o próximo cliente' : 'Esta oferta já não está disponível'}</p>
                <p className="t-body text-ink-mid mt-1">A vaga ficou disponível durante um período limitado. Quando expira, passa automaticamente para o próximo cliente elegível.</p>
              </div>
            </div>
          </Panel>
        ) : (
          <>
            <Panel className="p-6 sm:p-8" testId="waitlist-offer">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="t-card text-ink-hi">{data.shop_name}</p>
                  <p className="t-body text-ink-mid mt-1">{data.service_name}{data.haircut_name ? ' · ' + data.haircut_name : ''}</p>
                </div>
                <div className="rounded-full px-3 py-1.5 border border-accent-soft/20 bg-accent-soft/10 text-accent-soft t-label shrink-0">
                  {remaining}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mt-7">
                <Info icon={<CalendarClock size={16} />} label="Data" value={formatOfferDate(data.slot_start, data.timezone)} />
                <Info icon={<Clock3 size={16} />} label="Hora" value={formatOfferTime(data.slot_start, data.timezone)} />
                <Info icon={<UserRound size={16} />} label="Barbeiro" value={data.barber_name ?? 'Barbeiro'} />
                <Info icon={<Scissors size={16} />} label="Serviço" value={formatMT(data.service_price_cents) + ' · ' + data.service_duration_min + ' min'} />
              </div>

              <div className="border-t border-white/10 mt-7 pt-5">
                <p className="t-label text-ink-mid">Cliente</p>
                <p className="text-sm text-ink-hi mt-1">{data.customer_name}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-7">
                <Button className="flex-1" loading={claim.isPending} onClick={() => void accept()} data-testid="waitlist-claim-btn">
                  Aceitar vaga <ArrowRight size={16} />
                </Button>
                {data.shop_whatsapp && (
                  <a href={buildWhatsAppLink(data.shop_whatsapp, 'Olá, recebi uma oferta de vaga da ' + data.shop_name + ' e preciso de ajuda.')} target="_blank" rel="noreferrer">
                    <Button variant="secondary" type="button"><MessageCircle size={16} /> Ajuda</Button>
                  </a>
                )}
              </div>
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-2 text-accent-soft"><span aria-hidden>{icon}</span><span className="t-label">{label}</span></div>
      <p className="t-body text-ink-hi mt-2 capitalize">{value}</p>
    </div>
  );
}
