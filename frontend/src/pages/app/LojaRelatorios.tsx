import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Bell, Check, RefreshCw, TrendingUp, Package, ClipboardList, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Panel, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, humanError } from '@/lib/utils';

type Report = {
 from:string;to:string;orders_received:number;orders_accepted:number;orders_ready:number;orders_delivered:number;orders_cancelled:number;
 items_requested:number;items_delivered:number;low_stock_variants:number;unread_internal_alerts:number;external_provider_failures:number;
 paid_revenue_minor:number|null;paid_revenue_status:string;payment_records_count:number;payment_note:string;
};
type Alert = {id:string;order_id:string|null;event_type:string;title:string;body:string;delivery_channel:string;delivery_status:string;occurred_at:string;read_at:string|null};
type IncidentEvent = {id:string;event_type:string;actor_id:string|null;previous_state:Record<string,unknown>|null;next_state:Record<string,unknown>;created_at:string};
type Incident = {
 id:string;barbershop_id:string;order_id:string|null;incident_type:string;severity:string;status:string;summary:string;details:string;
 opened_by:string|null;assigned_to:string|null;resolved_by:string|null;resolution_note:string|null;resolved_at:string|null;
 created_at:string;updated_at:string;events:IncidentEvent[];
};
type IncidentInput = {incident_type:string;severity:string;summary:string;details:string;order_id:string|null};
type IncidentUpdate = {incident:Incident;status:'investigating'|'resolved'|'dismissed';resolutionNote?:string};
const incidentsFeatureEnabled = import.meta.env.VITE_SHOP_OPERATIONS_INCIDENTS_ENABLED === 'true';
const incidentTypes = [
 {value:'complaint',label:'Reclamação'},{value:'stock',label:'Stock'},{value:'order',label:'Pedido'},
 {value:'payment',label:'Pagamento'},{value:'notification',label:'Notificação'},{value:'privacy',label:'Privacidade'},{value:'other',label:'Outro'},
];
const severities = [{value:'low',label:'Baixa'},{value:'medium',label:'Média'},{value:'high',label:'Alta'},{value:'critical',label:'Crítica'}];
const statusLabels:Record<string,string>={open:'Aberto',investigating:'Em investigação',resolved:'Resolvido',dismissed:'Encerrado sem correcção'};
const severityLabels:Record<string,string>={low:'Baixa',medium:'Média',high:'Alta',critical:'Crítica'};
const typeLabels:Record<string,string>=Object.fromEntries(incidentTypes.map(t=>[t.value,t.label]));
const eventLabels:Record<string,string>={opened:'Registo criado',status_changed:'Estado alterado',assigned:'Responsável atribuído',resolved:'Resolvido',dismissed:'Encerrado'};
const today = () => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(t:string)=>parts.find(p=>p.type===t)?.value??'';return get('year')+'-'+get('month')+'-'+get('day');};
const daysAgo = (day:string,n:number) => {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
const fmt = (v:number) => new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(v||0);
const dateFmt = (v:string) => new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short',timeZone:'Africa/Maputo'}).format(new Date(v));
export default function LojaRelatorios(){
 const {shop,role}=useShop(); const qc=useQueryClient(); const canManageShop=!!shop?.id&&['owner','manager'].includes(role??''); const allowed=!!shop?.shop_enabled&&canManageShop;
 const [to]=useState(today()); const from=useMemo(()=>daysAgo(to,6),[to]);
 const [incidentType,setIncidentType]=useState('other');
 const [incidentSeverity,setIncidentSeverity]=useState('medium');
 const [incidentSummary,setIncidentSummary]=useState('');
 const [incidentDetails,setIncidentDetails]=useState('');
 const [incidentOrderId,setIncidentOrderId]=useState('');
 const [resolutionNotes,setResolutionNotes]=useState<Record<string,string>>({});

 const report=useQuery({queryKey:['shop-phase6-report',shop?.id,from,to],enabled:allowed,queryFn:async()=>{const {data,error}=await (supabase as any).rpc('get_shop_phase6_report',{p_barbershop_id:shop!.id,p_from:from,p_to:to});if(error)throw error;return data as Report;},retry:false,refetchInterval:60000});
 const alerts=useQuery({queryKey:['shop-notification-inbox',shop?.id],enabled:allowed,queryFn:async()=>{const {data,error}=await (supabase as any).rpc('get_shop_notification_inbox',{p_barbershop_id:shop!.id,p_limit:50});if(error)throw error;return (data??[]) as Alert[];},refetchInterval:30000,retry:false});
 const markRead=useMutation({mutationFn:async(id:string)=>{const {data,error}=await (supabase as any).rpc('mark_shop_notification_read',{p_barbershop_id:shop!.id,p_notification_id:id});if(error)throw error;if(data!==true)throw new Error('O alerta já não está disponível para esta barbearia.');},onSuccess:async()=>{await Promise.all([qc.invalidateQueries({queryKey:['shop-notification-inbox',shop?.id]}),qc.invalidateQueries({queryKey:['shop-phase6-report',shop?.id]})]);toast.success('Alerta marcado como lido.');},onError:e=>toast.error(humanError(e))});

 const incidents=useQuery({
  queryKey:['shop-operation-incidents',shop?.id],enabled:incidentsFeatureEnabled&&canManageShop,refetchInterval:30000,retry:false,
  queryFn:async()=>{const {data,error}=await (supabase as any).rpc('list_shop_operation_incidents',{p_barbershop_id:shop!.id,p_status:null,p_limit:100});if(error)throw error;return (data??[]) as Incident[];}
 });
 const createIncident=useMutation({
  mutationFn:async(input:IncidentInput)=>{
   const {data,error}=await (supabase as any).rpc('create_shop_operation_incident',{
    p_barbershop_id:shop!.id,p_order_id:input.order_id,p_incident_type:input.incident_type,p_severity:input.severity,p_summary:input.summary,p_details:input.details
   });
   if(error)throw error;if(!data?.id)throw new Error('O servidor não confirmou o registo do incidente.');return data as Incident;
  },
  onSuccess:async()=>{setIncidentSummary('');setIncidentDetails('');setIncidentOrderId('');await qc.invalidateQueries({queryKey:['shop-operation-incidents',shop?.id]});toast.success('Incidente registado com histórico de auditoria.');},
  onError:e=>toast.error(humanError(e))
 });
 const updateIncident=useMutation({
  mutationFn:async(input:IncidentUpdate)=>{
   const {data:userData,error:userError}=await supabase.auth.getUser();if(userError)throw userError;
   if(!userData.user)throw new Error('A sessão expirou. Entre novamente.');
   const {data,error}=await (supabase as any).rpc('update_shop_operation_incident',{
    p_barbershop_id:shop!.id,p_incident_id:input.incident.id,p_status:input.status,
    p_assigned_to:input.status==='investigating'?userData.user.id:null,p_resolution_note:input.resolutionNote??null
   });
   if(error)throw error;if(!data?.id)throw new Error('O servidor não confirmou a actualização do incidente.');return data as Incident;
  },
  onSuccess:async()=>{await qc.invalidateQueries({queryKey:['shop-operation-incidents',shop?.id]});toast.success('Estado do incidente actualizado.');},
  onError:e=>toast.error(humanError(e))
 });
 const submitIncident=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const summary=incidentSummary.trim();const details=incidentDetails.trim();const orderId=incidentOrderId.trim();
  if(summary.length<5||summary.length>180){toast.error('O resumo deve ter entre 5 e 180 caracteres.');return;}
  if(details.length<10||details.length>3000){toast.error('Os detalhes devem ter entre 10 e 3000 caracteres.');return;}
  if(orderId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)){toast.error('O ID do pedido não tem um formato válido.');return;}
  createIncident.mutate({incident_type:incidentType,severity:incidentSeverity,summary,details,order_id:orderId||null});
 };
 const openIncidents=(incidents.data??[]).filter(i=>i.status==='open'||i.status==='investigating');
 const criticalIncidents=openIncidents.filter(i=>i.severity==='critical').length;
 const openComplaints=openIncidents.filter(i=>i.incident_type==='complaint').length;
 const refresh=()=>{if(allowed){void report.refetch();void alerts.refetch();}if(incidentsFeatureEnabled&&canManageShop)void incidents.refetch();};

 const metrics:Array<{Icon:LucideIcon;label:string;value:number}> = report.data ? [
  {Icon:ClipboardList,label:'Pedidos recebidos',value:report.data.orders_received},
  {Icon:Check,label:'Aceites',value:report.data.orders_accepted},
  {Icon:Package,label:'Pedidos entregues',value:report.data.orders_delivered},
  {Icon:TrendingUp,label:'Artigos entregues',value:report.data.items_delivered},
  {Icon:Package,label:'Artigos pedidos',value:report.data.items_requested},
  {Icon:Package,label:'Artigos com stock baixo',value:report.data.low_stock_variants},
  {Icon:ClipboardList,label:'Pedidos cancelados',value:report.data.orders_cancelled},
  {Icon:Bell,label:'Alertas por ler',value:report.data.unread_internal_alerts},
  {Icon:AlertTriangle,label:'Falhas de canais externos',value:report.data.external_provider_failures},
 ] : [];
 if(!shop?.id) return <Page title="Comunicações e relatórios"><Panel><p className="text-sm text-ink-mid">Não foi possível identificar a barbearia activa.</p></Panel></Page>;
 if(!canManageShop) return <Page title="Comunicações e relatórios"><Panel><p className="text-sm text-ink-mid">Esta área requer permissões de proprietário ou gestor.</p></Panel></Page>;
 return <Page title="Comunicações e relatórios" subtitle="Acompanhe o serviço, os alertas e a receita registada sem confundir pedido, entrega e pagamento.">
  <div className="flex justify-end"><Button variant="secondary" onClick={refresh}><RefreshCw size={16}/> Actualizar</Button></div>
  {!shop.shop_enabled&&<Panel><p className="text-sm text-ink-mid">A Loja está desactivada para esta barbearia. Os pedidos e relatórios não são consultados. Os incidentes históricos só ficam acessíveis quando o módulo de suporte estiver autorizado neste ambiente.</p></Panel>}
  {allowed&&<>
  {report.isLoading?<Skeleton/>:report.isError?<ErrorState message={'Não foi possível carregar os relatórios: '+humanError(report.error)} onRetry={()=>void report.refetch()}/>:report.data&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({Icon,label,value})=><Panel key={label}><div className="flex items-center gap-2 text-sm text-ink-mid"><Icon size={16}/>{label}</div><div className="mt-2 text-2xl font-semibold text-ink-hi">{fmt(value)}</div></Panel>)}</div>
   <Panel><h2 className="font-semibold text-ink-hi">Receita paga registada</h2>
    {report.data.paid_revenue_minor===null?<p className="mt-2 text-sm text-ink-mid">Ainda não há um valor de receita reconciliável neste período.</p>:<div className="mt-2 text-2xl font-semibold text-ink-hi">{formatMT(report.data.paid_revenue_minor)}</div>}
    <p className="mt-2 text-sm text-ink-mid">{report.data.payment_records_count?fmt(report.data.payment_records_count)+' registo(s) de recebimento confirmados pela equipa. ':'Sem pagamentos de produtos registados neste período. '}A confirmação não representa reconciliação automática com M-Pesa, e-Mola, POS ou banco. Entrega não significa pagamento.</p>
    <p className="mt-2 text-xs text-ink-low">{report.data.payment_note}</p>
   </Panel>
  </>}
  <Panel><div className="flex items-center gap-2"><Bell size={18}/><h2 className="font-semibold text-ink-hi">Alertas internos recentes</h2></div>
   {alerts.isLoading?<Skeleton/>:alerts.isError?<ErrorState message={'Não foi possível carregar alertas: '+humanError(alerts.error)} onRetry={()=>void alerts.refetch()}/>:!alerts.data?.length?<EmptyState title="Sem alertas" body="Os novos pedidos e as transições operacionais aparecem aqui quando a Loja estiver activa."/>:
    <div className="mt-4 divide-y divide-white/10">{alerts.data.map(a=><div key={a.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className="font-medium text-ink-hi">{a.title}</span>{!a.read_at&&<span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">Novo</span>}</div><p className="mt-1 text-sm text-ink-mid">{a.body}</p><p className="mt-1 text-xs text-ink-low">{dateFmt(a.occurred_at)} · Interno · {a.delivery_status}</p></div>{!a.read_at&&<Button variant="secondary" disabled={markRead.isPending} onClick={()=>markRead.mutate(a.id)}><Check size={15}/> Marcar como lido</Button>}</div>)}</div>}
  </Panel>
  </>}
  {incidentsFeatureEnabled&&<section className="space-y-4" aria-labelledby="shop-incident-heading">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 id="shop-incident-heading" className="text-lg font-semibold text-ink-hi">Reclamações e incidentes</h2><p className="mt-1 text-sm text-ink-mid">Registo de suporte por barbearia, com responsável, resolução e histórico de auditoria.</p></div>
      {incidents.data&&<div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/10 px-3 py-1">Abertos: {openIncidents.length}</span><span className={criticalIncidents?'rounded-full border border-st-noshow/50 px-3 py-1 text-st-noshow':'rounded-full border border-white/10 px-3 py-1'}>Críticos: {criticalIncidents}</span><span className="rounded-full border border-white/10 px-3 py-1">Reclamações: {openComplaints}</span></div>}
    </div>
    <Panel>
      <h3 className="font-semibold text-ink-hi">Registar ocorrência</h3><p className="mt-1 text-sm text-ink-mid">Não inclua nome, telefone, tokens de gestão ou outros dados pessoais. Use o ID do pedido quando necessário.</p>
      <form className="mt-4 space-y-4" onSubmit={submitIncident}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="incident-type" className="t-label text-ink-mid mb-1.5 block">Tipo</label><select id="incident-type" className="field" value={incidentType} onChange={e=>setIncidentType(e.target.value)}>{incidentTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div><label htmlFor="incident-severity" className="t-label text-ink-mid mb-1.5 block">Gravidade</label><select id="incident-severity" className="field" value={incidentSeverity} onChange={e=>setIncidentSeverity(e.target.value)}>{severities.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
        </div>
        <Field label="Resumo" name="incident-summary" maxLength={180} value={incidentSummary} onChange={e=>setIncidentSummary(e.target.value)} hint="Entre 5 e 180 caracteres." required/>
        <Field label="ID do pedido (opcional)" name="incident-order-id" value={incidentOrderId} onChange={e=>setIncidentOrderId(e.target.value)} hint="UUID do pedido, se necessário."/>
        <div><label htmlFor="incident-details" className="t-label text-ink-mid mb-1.5 block">Descrição e impacto</label><textarea id="incident-details" className="field min-h-28 w-full resize-y" value={incidentDetails} onChange={e=>setIncidentDetails(e.target.value)} minLength={10} maxLength={3000} required aria-describedby="incident-details-hint"/><p id="incident-details-hint" className="t-label mt-1.5 text-ink-mid">Descreva o impacto e os passos para reproduzir, sem dados pessoais.</p></div>
        <div className="flex justify-end"><Button type="submit" loading={createIncident.isPending}>Registar incidente</Button></div>
      </form>
    </Panel>
    {incidents.isLoading?<Skeleton/>:incidents.isError?<ErrorState message={'Não foi possível carregar incidentes: '+humanError(incidents.error)} onRetry={()=>void incidents.refetch()}/>:!incidents.data?.length
      ?<Panel><EmptyState title="Sem incidentes registados" body="As reclamações e falhas operacionais aparecerão aqui depois de serem registadas."/></Panel>
      :<div className="space-y-3">{incidents.data.map(i=><Panel key={i.id}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink-hi">{i.summary}</span><span className={i.severity==='critical'?'rounded-full border border-st-noshow/50 px-2 py-0.5 text-xs text-st-noshow':i.severity==='high'?'rounded-full border border-accent/50 px-2 py-0.5 text-xs text-accent-ink':'rounded-full border border-white/10 px-2 py-0.5 text-xs text-ink-mid'}>{severityLabels[i.severity]??i.severity}</span></div><p className="mt-1 text-xs text-ink-low">{typeLabels[i.incident_type]??i.incident_type} · {statusLabels[i.status]??i.status} · {dateFmt(i.created_at)}</p><p className="mt-3 whitespace-pre-wrap text-sm text-ink-mid">{i.details}</p>{i.order_id&&<p className="mt-2 break-all text-xs text-ink-low">Pedido: {i.order_id}</p>}{i.resolution_note&&<p className="mt-3 text-sm text-ink-mid"><strong>Resolução:</strong> {i.resolution_note}</p>}</div>
          <div className="flex shrink-0 flex-wrap gap-2">{i.status==='open'&&<Button size="sm" variant="secondary" loading={updateIncident.isPending} onClick={()=>updateIncident.mutate({incident:i,status:'investigating'})}>Assumir e investigar</Button>}</div>
        </div>
        {(i.status==='open'||i.status==='investigating')&&<div className="mt-4 border-t border-white/10 pt-4"><label htmlFor={'resolution-'+i.id} className="t-label text-ink-mid mb-1.5 block">Nota de resolução (obrigatória para encerrar)</label><textarea id={'resolution-'+i.id} className="field min-h-20 w-full resize-y" value={resolutionNotes[i.id]??''} onChange={e=>setResolutionNotes(prev=>({...prev,[i.id]:e.target.value}))} minLength={10} maxLength={1500} placeholder="Causa, correcção aplicada e evidência de verificação."/><div className="mt-3 flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" disabled={(resolutionNotes[i.id]??'').trim().length<10||updateIncident.isPending} onClick={()=>updateIncident.mutate({incident:i,status:'dismissed',resolutionNote:resolutionNotes[i.id]})}>Encerrar sem correcção</Button><Button size="sm" disabled={(resolutionNotes[i.id]??'').trim().length<10||updateIncident.isPending} onClick={()=>updateIncident.mutate({incident:i,status:'resolved',resolutionNote:resolutionNotes[i.id]})}>Resolver incidente</Button></div></div>}
        {i.events?.length>0&&<details className="mt-4 border-t border-white/10 pt-3"><summary className="cursor-pointer text-sm text-ink-mid">Histórico ({i.events.length})</summary><ol className="mt-3 space-y-2">{i.events.map(ev=><li key={ev.id} className="flex flex-col gap-1 text-xs text-ink-mid sm:flex-row sm:justify-between"><span>{eventLabels[ev.event_type]??ev.event_type}{typeof ev.next_state.status==='string'?' · '+(statusLabels[ev.next_state.status]??ev.next_state.status):''}</span><time dateTime={ev.created_at}>{dateFmt(ev.created_at)}</time></li>)}</ol></details>}
      </Panel>)}</div>}
  </section>}
  {!incidentsFeatureEnabled&&<Panel><div className="flex items-center gap-2"><ShieldAlert size={18}/><h2 className="font-semibold text-ink-hi">Suporte de rollout</h2></div><p className="mt-2 text-sm text-ink-mid">O módulo de incidentes está desligado neste build. Só pode ser activado depois de a migration da Fase 8 estar instalada e testada no ambiente correspondente.</p></Panel>}
 </Page>;
}
