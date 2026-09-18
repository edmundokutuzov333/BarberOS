import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Panel, Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusChip, type ApptStatus } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, fmt, todayRange, monthStart, nowTz, humanError } from '@/lib/utils';

interface Appt {
  id: string; starts_at: string; ends_at: string; duration_min: number; price_cents: number;
  status: ApptStatus; deposit_status: string;
  customers: { name: string } | null; services: { name: string } | null;
  haircuts: { name: string } | null; barbers: { display_name: string } | null;
}

async function loadDashboard(shopId: string) {
  const { from, to } = todayRange();
  const weekday = nowTz().getDay();
  const [appts, noShows, hours, barbers, waiting, reviews] = await Promise.all([
    supabase.from('appointments').select('id,starts_at,ends_at,duration_min,price_cents,status,deposit_status,customers(name),services(name),haircuts(name),barbers(display_name)')
      .eq('barbershop_id', shopId).gte('starts_at', from).lte('starts_at', to).order('starts_at'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('barbershop_id', shopId).eq('status', 'no_show').gte('starts_at', monthStart()),
    supabase.from('working_hours').select('barber_id,opens_at,closes_at,is_closed').eq('barbershop_id', shopId).eq('weekday', weekday),
    supabase.from('barbers').select('id').eq('barbershop_id', shopId).eq('is_active', true),
    supabase.from('waitlist_entries').select('id', { count: 'exact', head: true }).eq('barbershop_id', shopId).eq('status', 'waiting'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('barbershop_id', shopId).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()),
  ]);
  for (const r of [appts, noShows, hours, barbers, waiting, reviews]) if (r.error) throw r.error;

  const list = (appts.data ?? []) as unknown as Appt[];
  const live = list.filter((a) => a.status !== 'cancelled');
  const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const shopHours = hours.data?.find((h) => !h.barber_id);
  const openMin = shopHours && !shopHours.is_closed ? mins(shopHours.closes_at) - mins(shopHours.opens_at) : 0;
  const capacity = (barbers.data?.length ?? 0) * openMin;
  const booked = live.filter((a) => a.status !== 'no_show').reduce((s, a) => s + a.duration_min, 0);

  return {
    today: live.length,
    occupancy: capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : null,
    revenue: live.filter((a) => a.status !== 'no_show').reduce((s, a) => s + a.price_cents, 0),
    noShows: noShows.count ?? 0,
    next: live.filter((a) => new Date(a.starts_at) >= new Date() && ['pending', 'confirmed'].includes(a.status)).slice(0, 5),
    pendingDeposit: live.filter((a) => a.status === 'pending' && a.deposit_status === 'awaiting').length,
    waiting: waiting.count ?? 0,
    newReviews: reviews.count ?? 0,
    hasBarbers: (barbers.data?.length ?? 0) > 0,
  };
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="glass p-5 sm:p-6">
      <p className="t-label text-ink-mid">{label}</p>
      <p data-testid={testId} className="t-kpi mt-3">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { shop } = useShop();
  const q = useQuery({ queryKey: ['dashboard', shop!.id], queryFn: () => loadDashboard(shop!.id), refetchInterval: 60_000 });
  const publicUrl = `${window.location.origin}/barbearia/${shop!.slug}`;
  const copyLink = async () => { await navigator.clipboard.writeText(publicUrl); toast.success('Link copiado'); };

  return (
    <Page testId="dashboard-page" title={shop!.name} subtitle={fmt(new Date(), "EEEE, d 'de' MMMM")}>
      {shop!.onboarding_step < 9 && (
        <div data-testid="onboarding-banner" className="glass glass-3 !rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3" style={{ boxShadow: 'none' }}>
          <p className="t-body">Configuração a {Math.round((Math.max(1, shop!.onboarding_step) / 9) * 100)}%. Faltam {9 - Math.max(1, shop!.onboarding_step)} passos para a agenda estar pronta.</p>
          <Link to="/app/onboarding"><Button data-testid="continue-onboarding-btn" size="sm" pill>Continuar configuração</Button></Link>
        </div>
      )}
      {q.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" lines={2} />)}</div>
      ) : q.error ? (
        <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi testId="kpi-today" label="Marcações de hoje" value={String(q.data!.today)} />
            <Kpi testId="kpi-occupancy" label="Ocupação da agenda" value={q.data!.occupancy === null ? '—' : `${q.data!.occupancy}%`} />
            <Kpi testId="kpi-revenue" label="Receita estimada de hoje" value={formatMT(q.data!.revenue)} />
            <Kpi testId="kpi-noshows" label="Faltas do mês" value={String(q.data!.noShows)} />
          </div>

          <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-4 mt-4">
            <Panel title="A seguir" testId="next-panel">
              {q.data!.next.length === 0 ? (
                <EmptyState testId="next-empty" title="Nada marcado para hoje." body="Partilha o teu link para encher a agenda."
                  action={<Button data-testid="copy-link-btn" variant="secondary" size="sm" pill onClick={copyLink}><Copy size={14} />Copiar link</Button>} />
              ) : (
                <ul className="divide-y divide-white/5">
                  {q.data!.next.map((a) => (
                    <li key={a.id} data-testid={`next-appt-${a.id}`} className="flex items-center gap-4 py-3">
                      <span className="text-lg font-medium tracking-[-0.01em] w-14">{fmt(a.starts_at, 'HH:mm')}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-normal truncate">{a.customers?.name ?? 'Cliente'}</p>
                        <p className="t-label text-ink-mid truncate">{[a.services?.name, a.haircuts?.name, a.barbers?.display_name].filter(Boolean).join(' · ')}</p>
                      </div>
                      <StatusChip status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Precisa de atenção" testId="attention-panel">
              {!q.data!.hasBarbers ? (
                <EmptyState testId="attention-no-barbers" title="Ainda não tens barbeiros." body="Sem barbeiros activos, a agenda não abre."
                  action={<Link to="/app/barbeiros"><Button data-testid="go-barbers-btn" size="sm" pill>Adicionar barbeiro</Button></Link>} />
              ) : q.data!.pendingDeposit + q.data!.waiting + q.data!.newReviews === 0 ? (
                <p data-testid="attention-empty" className="t-body text-ink-mid py-4">Nada a fazer por agora.</p>
              ) : (
                <ul className="space-y-2">
                  {q.data!.pendingDeposit > 0 && <li data-testid="attention-deposits" className="rounded-2xl bg-st-pending/10 border border-st-pending/25 px-4 py-3 text-sm"><span className="font-medium">{q.data!.pendingDeposit}</span> {q.data!.pendingDeposit === 1 ? 'marcação à espera de sinal' : 'marcações à espera de sinal'}</li>}
                  {q.data!.waiting > 0 && <li data-testid="attention-waitlist" className="rounded-2xl bg-accent/10 border border-accent/25 px-4 py-3 text-sm"><span className="font-medium">{q.data!.waiting}</span> {q.data!.waiting === 1 ? 'pessoa na lista de espera' : 'pessoas na lista de espera'}</li>}
                  {q.data!.newReviews > 0 && <li data-testid="attention-reviews" className="rounded-2xl bg-st-done/10 border border-st-done/25 px-4 py-3 text-sm"><span className="font-medium">{q.data!.newReviews}</span> {q.data!.newReviews === 1 ? 'avaliação nova esta semana' : 'avaliações novas esta semana'}</li>}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}
