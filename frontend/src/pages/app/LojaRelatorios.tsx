import { useMemo, useState } from 'react';
import { Bell, Check, RefreshCw, TrendingUp, Package, ClipboardList, type LucideIcon } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Panel, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { humanError } from '@/lib/utils';

type Report = {
 from:string;to:string;orders_received:number;orders_accepted:number;orders_ready:number;orders_delivered:number;orders_cancelled:number;
 items_requested:number;items_delivered:number;low_stock_variants:number;unread_internal_alerts:number;external_provider_failures:number;
 paid_revenue_minor:number|null;paid_revenue_status:string;payment_note:string;
};
type Alert = {id:string;order_id:string|null;event_type:string;title:string;body:string;delivery_channel:string;delivery_status:string;occurred_at:string;read_at:string|null};
const today = () => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(t:string)=>parts.find(p=>p.type===t)?.value??'';return get('year')+'-'+get('month')+'-'+get('day');};
const daysAgo = (day:string,n:number) => {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
const fmt = (v:number) => new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(v||0);
const dateFmt = (v:string) => new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short',timeZone:'Africa/Maputo'}).format(new Date(v));
export default function LojaRelatorios(){
 const {shop,role}=useShop(); const qc=useQueryClient(); const allowed=!!shop?.id&&!!shop?.shop_enabled&&['owner','manager'].includes(role??'');
 const [to]=useState(today()); const from=useMemo(()=>daysAgo(to,6),[to]);
 const report=useQuery({queryKey:['shop-phase6-report',shop?.id,from,to],enabled:allowed,queryFn:async()=>{const {data,error}=await (supabase as any).rpc('get_shop_phase6_report',{p_barbershop_id:shop!.id,p_from:from,p_to:to});if(error)throw error;return data as Report;},retry:false,refetchInterval:60000});
 const alerts=useQuery({queryKey:['shop-notification-inbox',shop?.id],enabled:allowed,queryFn:async()=>{const {data,error}=await (supabase as any).rpc('get_shop_notification_inbox',{p_barbershop_id:shop!.id,p_limit:50});if(error)throw error;return (data??[]) as Alert[];},refetchInterval:30000,retry:false});
 const markRead=useMutation({mutationFn:async(id:string)=>{const {data,error}=await (supabase as any).rpc('mark_shop_notification_read',{p_barbershop_id:shop!.id,p_notification_id:id});if(error)throw error;if(data!==true)throw new Error('O alerta já não está disponível para esta barbearia.');},onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:['shop-notification-inbox',shop?.id]}),qc.invalidateQueries({queryKey:['shop-phase6-report',shop?.id]})]);toast.success('Alerta marcado como lido.');},onError:e=>toast.error(humanError(e))});
 const metrics:Array<{Icon:LucideIcon;label:string;value:number}> = report.data ? [
  {Icon:ClipboardList,label:'Pedidos recebidos',value:report.data.orders_received},
  {Icon:Check,label:'Aceites',value:report.data.orders_accepted},
  {Icon:Package,label:'Pedidos entregues',value:report.data.orders_delivered},
  {Icon:TrendingUp,label:'Artigos entregues',value:report.data.items_delivered},
  {Icon:Package,label:'Artigos pedidos',value:report.data.items_requested},
  {Icon:Package,label:'Artigos com stock baixo',value:report.data.low_stock_variants},
  {Icon:ClipboardList,label:'Pedidos cancelados',value:report.data.orders_cancelled},
  {Icon:Bell,label:'Alertas por ler',value:report.data.unread_internal_alerts},
 ] : [];
 if(!shop?.shop_enabled) return <Page title="Comunicações e relatórios"><Panel><p className="text-sm text-ink-mid">A Loja está desactivada para esta barbearia. Os alertas e relatórios da Loja só ficam disponíveis quando a funcionalidade for activada com aprovação operacional.</p></Panel></Page>;
 if(!allowed) return <Page title="Comunicações e relatórios"><Panel><p className="text-sm text-ink-mid">Esta área requer permissões de proprietário ou gestor.</p></Panel></Page>;
 return <Page title="Comunicações e relatórios" subtitle="Alertas internos e indicadores operacionais da Loja. Pedidos, entregas e pagamentos são contabilizados separadamente.">
  <div className="flex justify-end"><Button variant="secondary" onClick={()=>{void report.refetch();void alerts.refetch();}}><RefreshCw size={16}/> Actualizar</Button></div>
  {report.isLoading?<Skeleton/>:report.isError?<ErrorState message={`Não foi possível carregar os relatórios: ${humanError(report.error)}`} onRetry={()=>void report.refetch()}/>:report.data&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({Icon,label,value})=><Panel key={label}><div className="flex items-center gap-2 text-sm text-ink-mid"><Icon size={16}/>{label}</div><div className="mt-2 text-2xl font-semibold text-ink-hi">{fmt(value)}</div></Panel>)}</div>
   <Panel><h2 className="font-semibold text-ink-hi">Receita paga</h2><p className="mt-2 text-sm text-ink-mid">Não disponível: ainda não existe uma ligação verificada entre pagamentos reais e linhas de venda da Loja. Entrega não significa pagamento.</p></Panel>
  </>}
  <Panel><div className="flex items-center gap-2"><Bell size={18}/><h2 className="font-semibold text-ink-hi">Alertas internos recentes</h2></div>
   {alerts.isLoading?<Skeleton/>:alerts.isError?<ErrorState message={`Não foi possível carregar alertas: ${humanError(alerts.error)}`} onRetry={()=>void alerts.refetch()}/>:!alerts.data?.length?<EmptyState title="Sem alertas" body="Os novos pedidos e as transições operacionais aparecem aqui quando a Loja estiver activa."/>:
    <div className="mt-4 divide-y divide-white/10">{alerts.data.map(a=><div key={a.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className="font-medium text-ink-hi">{a.title}</span>{!a.read_at&&<span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">Novo</span>}</div><p className="mt-1 text-sm text-ink-mid">{a.body}</p><p className="mt-1 text-xs text-ink-low">{dateFmt(a.occurred_at)} · Interno · {a.delivery_status}</p></div>{!a.read_at&&<Button variant="secondary" disabled={markRead.isPending} onClick={()=>markRead.mutate(a.id)}><Check size={15}/> Marcar como lido</Button>}</div>)}</div>}
  </Panel>
 </Page>;
}
