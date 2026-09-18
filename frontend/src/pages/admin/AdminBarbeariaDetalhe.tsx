import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { useAdminPlans, useAdminShopDetail, useAssignAdminShopPlan, useSetAdminShopStatus, type ShopStatus } from '@/features/admin/api';
import { AdminStatus } from '@/features/admin/AdminComponents';

const STATUS_VALUES: ShopStatus[]=['trial','active','suspended','cancelled'];

export default function AdminBarbeariaDetalhe() {
  const { shopId }=useParams();
  const q=useAdminShopDetail(shopId);
  const plans=useAdminPlans();
  const statusMutation=useSetAdminShopStatus();
  const planMutation=useAssignAdminShopPlan();
  const [status,setStatus]=useState<ShopStatus>('trial');
  const [planId,setPlanId]=useState('');
  const shop=useMemo(()=>q.data?.shop as {id:string;name:string;slug:string;status:ShopStatus;description:string|null;phone:string|null;whatsapp:string|null;instagram:string|null;address:string|null;timezone:string;created_at:string} | undefined,[q.data]);
  useEffect(()=>{if(shop){setStatus(shop.status);setPlanId(q.data?.plan?.id??'');}},[shop,q.data?.plan?.id]);
  const saveStatus=async()=>{
    if(!shopId||status===shop?.status)return;
    if((status==='suspended'||status==='cancelled')&&!window.confirm('Confirmar a alteração do estado desta barbearia para '+status+'?'))return;
    await statusMutation.mutateAsync({shopId,status});
  };
  const savePlan=async()=>{if(!shopId||!planId||planId===q.data?.plan?.id)return;await planMutation.mutateAsync({shopId,planId});};

  return <Page title={shop?.name??'Barbearia'} subtitle={shop?'/barbearia/'+shop.slug:undefined} actions={<div className="flex gap-2"><Link to="/admin/barbearias"><Button variant="secondary" size="sm"><ArrowLeft size={14}/>Voltar</Button></Link>{shop&&<a href={'/barbearia/'+shop.slug} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm"><ExternalLink size={14}/>Página pública</Button></a>}</div>}>
    {q.isLoading?<><Skeleton className="h-40"/><Skeleton className="h-72 mt-3"/></>:q.error?<ErrorState message={humanError(q.error)} onRetry={()=>void q.refetch()}/>:q.data&&shop?<>
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Object.entries(q.data.stats).map(([k,v])=><Panel key={k} className="p-4"><p className="t-label text-ink-lo">{({barbers:'Barbeiros',active_barbers:'Barbeiros activos',customers:'Clientes',appointments:'Marcações',completed_appointments:'Concluídas',reviews:'Avaliações',payments:'Pagamentos'})[k]??k}</p><p className="text-2xl font-medium text-ink-hi mt-2">{v}</p></Panel>)}
      </section>
      <section className="grid xl:grid-cols-2 gap-3 mt-3">
        <Panel title="Estado da conta" aside={<AdminStatus kind="shop" value={shop.status}/>}>
          <div className="space-y-4"><div><label className="t-label text-ink-mid block mb-1.5" htmlFor="admin-shop-status">Estado</label><select id="admin-shop-status" className="field w-full" value={status} onChange={e=>setStatus(e.target.value as ShopStatus)}>{STATUS_VALUES.map(v=><option key={v} value={v}>{v==='trial'?'Teste':v==='active'?'Activa':v==='suspended'?'Suspensa':'Cancelada'}</option>)}</select></div><Button size="sm" onClick={()=>void saveStatus()} loading={statusMutation.isPending} disabled={status===shop.status}><Save size={14}/>Guardar estado</Button></div>
        </Panel>
        <Panel title="Plano">
          <div className="space-y-4"><div><label className="t-label text-ink-mid block mb-1.5" htmlFor="admin-shop-plan">Plano atribuído</label><select id="admin-shop-plan" className="field w-full" value={planId} onChange={e=>setPlanId(e.target.value)}>{plans.data?.map(p=><option key={p.id} value={p.id}>{p.name} · {formatMT(p.price_cents)}</option>)}</select></div><p className="t-label text-ink-lo">{q.data.plan?.max_barbers??0} barbeiros máximos · {q.data.plan?.is_active?'activo':'inactivo'}</p><Button size="sm" onClick={()=>void savePlan()} loading={planMutation.isPending} disabled={!planId||planId===q.data.plan?.id}><Check size={14}/>Atribuir plano</Button></div>
        </Panel>
      </section>
      <Panel className="mt-3" title="Dados da barbearia"><dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4">{[['Descrição',shop.description||'Não definida'],['Telefone',shop.phone||'Não definido'],['WhatsApp',shop.whatsapp||'Não definido'],['Instagram',shop.instagram||'Não definido'],['Morada',shop.address||'Não definida'],['Timezone',shop.timezone],['Criada',fmt(shop.created_at,'dd MMM yyyy, HH:mm')]].map(([l,v])=><div key={l}><dt className="t-label text-ink-lo">{l}</dt><dd className="text-sm text-ink-hi mt-1">{v}</dd></div>)}</dl></Panel>
      <Panel className="mt-3" title="Membros">{q.data.members.length?<div className="grid sm:grid-cols-2 gap-3">{q.data.members.map(m=><div key={m.user_id} className="rounded-2xl bg-white/5 p-4 flex items-center justify-between gap-3"><div><p className="text-sm text-ink-hi">{m.full_name||'Sem nome'}</p><p className="t-label text-ink-lo">{m.phone||'Sem telefone'}</p></div><span className="t-label text-ink-mid capitalize">{m.role}</span></div>)}</div>:<EmptyState title="Sem membros."/>}</Panel>
      <Panel className="mt-3" title="Actividade da barbearia" aside={<Button variant="ghost" size="sm" onClick={()=>void q.refetch()}><RefreshCw size={14}/>Actualizar</Button>}>{q.data.activity.length?<div className="divide-y divide-white/5">{q.data.activity.map((a,i)=><div key={a.entity_id+'-'+i} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"><div><p className="text-sm text-ink-hi">{a.action}</p><p className="t-label text-ink-lo">{a.entity||'sistema'}</p></div><time className="t-label text-ink-lo">{fmt(a.created_at,'dd MMM yyyy, HH:mm')}</time></div>)}</div>:<EmptyState title="Sem actividade registada." body="As alterações administrativas desta barbearia aparecerão aqui."/>}</Panel>
      {(statusMutation.error||planMutation.error)&&<div className="mt-4"><ErrorState message={humanError(statusMutation.error||planMutation.error)}/></div>}
      <p className="t-label text-ink-lo mt-4 flex items-center gap-2"><ShieldCheck size={14}/>As alterações administrativas são executadas no PostgreSQL e registadas em auditoria.</p>
    </>:null}
  </Page>;
}
