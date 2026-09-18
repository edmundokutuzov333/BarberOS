import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Page } from '@/components/layout/Page';
import { Panel, Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, fmt, humanError } from '@/lib/utils';

const dashboardSchema = z.object({
  today: z.number().int().nonnegative(),
  occupancy: z.number().nullable(),
  revenue: z.number().int().nonnegative(),
  noShows: z.number().int().nonnegative(),
  pendingDeposit: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  newReviews: z.number().int().nonnegative(),
  hasBarbers: z.boolean(),
  next: z.array(z.object({
    appointment_id: z.string().uuid(),
    starts_at: z.string(),
    status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
    customer_name: z.string().nullable(),
    service_name: z.string().nullable(),
    haircut_name: z.string().nullable(),
    barber_name: z.string().nullable(),
  })),
});

export type DashboardSnapshot = z.infer<typeof dashboardSchema>;

async function loadDashboard(shopId: string): Promise<DashboardSnapshot> {
  const { data, error } = await supabase.rpc('get_dashboard_snapshot', { p_shop: shopId });
  if (error) throw error;
  const parsed = dashboardSchema.safeParse(data);
  if (!parsed.success) throw new Error('DASHBOARD_INVALID_RESPONSE');
  return parsed.data;
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
  const { shop, role } = useShop();
  const canManageShop = role === 'owner' || role === 'manager';
  const q = useQuery({
    queryKey: ['dashboard', shop?.id],
    queryFn: () => loadDashboard(shop!.id),
    enabled: Boolean(shop),
    refetchInterval: 60_000,
  });

  if (!shop) return null;

  const publicUrl = window.location.origin + '/barbearia/' + shop.slug;
  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success('Link copiado');
  };

  return (
    <Page testId="dashboard-page" title={shop.name} subtitle={fmt(new Date(), "EEEE, d 'de' MMMM")}>
      {shop.onboarding_step < 9 && canManageShop && (
        <div data-testid="onboarding-banner" className="glass glass-3 !rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3" style={{ boxShadow: 'none' }}>
          <p className="t-body">Configuração a {Math.round((Math.max(1, shop.onboarding_step) / 9) * 100)}%. Faltam {9 - Math.max(1, shop.onboarding_step)} passos para a agenda estar pronta.</p>
          <Link to="/app/onboarding"><Button data-testid="continue-onboarding-btn" size="sm" pill>Continuar configuração</Button></Link>
        </div>
      )}

      {q.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" lines={2} />)}</div>
      ) : q.error ? (
        <ErrorState message={humanError(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi testId="kpi-today" label="Marcações de hoje" value={String(q.data!.today)} />
            <Kpi testId="kpi-occupancy" label="Ocupação da agenda" value={q.data!.occupancy === null ? 'n/d' : q.data!.occupancy + '%'} />
            <Kpi testId="kpi-revenue" label="Receita estimada de hoje" value={formatMT(q.data!.revenue)} />
            <Kpi testId="kpi-noshows" label="Faltas do mês" value={String(q.data!.noShows)} />
          </div>

          <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-4 mt-4">
            <Panel title="A seguir" testId="next-panel">
              {q.data!.next.length === 0 ? (
                <EmptyState
                  testId="next-empty"
                  title="Nada marcado para hoje."
                  body="Partilha o teu link para encher a agenda."
                  action={<Button data-testid="copy-link-btn" variant="secondary" size="sm" pill onClick={copyLink}><Copy size={14} />Copiar link</Button>}
                />
              ) : (
                <ul className="divide-y divide-white/5">
                  {q.data!.next.map((a) => (
                    <li key={a.appointment_id} data-testid={'next-appt-' + a.appointment_id} className="flex items-center gap-4 py-3">
                      <span className="text-lg font-medium tracking-[-0.01em] w-14">{fmt(a.starts_at, 'HH:mm')}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-normal truncate">{a.customer_name ?? 'Cliente'}</p>
                        <p className="t-label text-ink-mid truncate">
                          {[a.service_name, a.haircut_name, a.barber_name].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <StatusChip status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Precisa de atenção" testId="attention-panel">
              {!q.data!.hasBarbers ? (
                <EmptyState
                  testId="attention-no-barbers"
                  title="Ainda não há barbeiros activos."
                  body={canManageShop ? 'Sem barbeiros activos, a agenda não abre.' : 'Peça ao dono ou gerente para configurar os barbeiros da loja.'}
                  action={canManageShop ? <Link to="/app/barbeiros"><Button data-testid="go-barbers-btn" size="sm" pill>Adicionar barbeiro</Button></Link> : undefined}
                />
              ) : q.data!.pendingDeposit + q.data!.waiting + q.data!.newReviews === 0 ? (
                <p data-testid="attention-empty" className="t-body text-ink-mid py-4">Nada a fazer por agora.</p>
              ) : (
                <ul className="space-y-2">
                  {q.data!.pendingDeposit > 0 && (
                    <li data-testid="attention-deposits" className="rounded-2xl bg-st-pending/10 border border-st-pending/25 px-4 py-3 text-sm">
                      <span className="font-medium">{q.data!.pendingDeposit}</span> {q.data!.pendingDeposit === 1 ? 'marcação à espera de sinal' : 'marcações à espera de sinal'}
                    </li>
                  )}
                  {q.data!.waiting > 0 && (
                    <li data-testid="attention-waitlist" className="rounded-2xl bg-accent/10 border border-accent/25 px-4 py-3 text-sm">
                      <span className="font-medium">{q.data!.waiting}</span> {q.data!.waiting === 1 ? 'pessoa na lista de espera' : 'pessoas na lista de espera'}
                    </li>
                  )}
                  {q.data!.newReviews > 0 && (
                    <li data-testid="attention-reviews" className="rounded-2xl bg-st-done/10 border border-st-done/25 px-4 py-3 text-sm">
                      <span className="font-medium">{q.data!.newReviews}</span> {q.data!.newReviews === 1 ? 'avaliação nova esta semana' : 'avaliações novas esta semana'}
                    </li>
                  )}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </Page>
  );
}
