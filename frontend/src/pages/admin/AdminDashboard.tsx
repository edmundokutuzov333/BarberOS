import { Building2, TrendingUp, UserPlus, Users, WalletCards, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { useAdminActivity, useAdminOverview } from '@/features/admin/api';
import { AdminMetricCard } from '@/features/admin/AdminComponents';

export default function AdminDashboard() {
  const overview = useAdminOverview();
  const activity = useAdminActivity(12);
  return (
    <Page testId="admin-dashboard" title="Visão geral" subtitle="Operação central do ecossistema BarberOS.">
      {overview.isLoading ? <div className="grid grid-cols-2 xl:grid-cols-4 gap-3"><Skeleton className="h-32"/><Skeleton className="h-32"/><Skeleton className="h-32"/><Skeleton className="h-32"/></div>
      : overview.error ? <ErrorState message={humanError(overview.error)} onRetry={()=>void overview.refetch()}/>
      : overview.data ? <>
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <AdminMetricCard label="Barbearias" value={overview.data.shops.total} detail={overview.data.shops.active + ' activas · ' + overview.data.shops.trial + ' em teste'} icon={Building2}/>
          <AdminMetricCard label="Utilizadores" value={overview.data.users} detail={overview.data.barbers + ' barbeiros activos'} icon={Users}/>
          <AdminMetricCard label="Clientes" value={overview.data.customers} detail={overview.data.appointments.completed + ' atendimentos concluídos'} icon={UserPlus}/>
          <AdminMetricCard label="Receita estimada" value={formatMT(overview.data.revenue.estimated_completed_cents)} detail={formatMT(overview.data.revenue.paid_deposit_cents) + ' em sinais pagos'} icon={TrendingUp}/>
        </section>
        <section className="grid lg:grid-cols-2 gap-3 mt-3">
          <Panel title="Estado das barbearias">
            <div className="grid grid-cols-2 gap-3">{[['active','Activas'],['trial','Em teste'],['suspended','Suspensas'],['cancelled','Canceladas']].map(([k,l])=><div key={k} className="rounded-2xl bg-white/5 p-4 flex items-center justify-between"><span className="text-sm text-ink-mid">{l}</span><span className="t-card text-ink-hi">{overview.data.shops[k as keyof typeof overview.data.shops]}</span></div>)}</div>
            <Link className="inline-block mt-5" to="/admin/barbearias"><Button variant="secondary" size="sm">Abrir barbearias</Button></Link>
          </Panel>
          <Panel title="Operação">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4"><p className="t-label text-ink-lo">Pagamentos</p><p className="t-card text-ink-hi mt-1">{overview.data.payments.paid} pagos</p><p className="t-label text-ink-lo mt-1">{overview.data.payments.pending} pendentes · {overview.data.payments.failed} falhados</p></div>
              <div className="rounded-2xl bg-white/5 p-4"><p className="t-label text-ink-lo">Avaliações</p><p className="t-card text-ink-hi mt-1">{overview.data.reviews.published} publicadas</p><p className="t-label text-ink-lo mt-1">{overview.data.reviews.total} no total</p></div>
            </div>
            <div className="flex gap-2 mt-5"><Link to="/admin/pagamentos"><Button variant="secondary" size="sm"><WalletCards size={14}/>Pagamentos</Button></Link><Link to="/admin/metricas"><Button variant="secondary" size="sm"><Activity size={14}/>Métricas</Button></Link></div>
          </Panel>
        </section>
        <Panel className="mt-3" title="Actividade recente">
          {activity.isLoading ? <Skeleton className="h-48"/> : activity.error ? <ErrorState message={humanError(activity.error)} onRetry={()=>void activity.refetch()}/> : activity.data?.length ? <div className="divide-y divide-white/5">{activity.data.map(item=><div key={item.id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><div><p className="text-sm text-ink-hi">{item.action}</p><p className="t-label text-ink-lo">{item.shop_name ?? 'Plataforma'} · {item.entity ?? 'sistema'}</p></div><time className="t-label text-ink-lo">{fmt(item.created_at,'dd MMM yyyy, HH:mm')}</time></div>)}</div> : <EmptyState title="Ainda não há actividade administrativa." body="As alterações feitas pelo Admin Oryon aparecerão aqui."/>}
        </Panel>
      </> : null}
    </Page>
  );
}
