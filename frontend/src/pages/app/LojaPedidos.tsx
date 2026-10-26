import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, PackageCheck, RefreshCw, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Panel, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, humanError } from '@/lib/utils';

type Item = { id:string; product_name:string; variant:string; qty:number; delivered_qty:number; unit_price_minor:number; line_total_minor:number; options:unknown; status:string; variant_id:string; product_id:string };
type Order = { id:string; status:string; requested_for:string; customer_note:string|null; internal_note:string|null; needs_confirmation_reason:string|null; assigned_to:string|null; appointment:{starts_at:string;status:string;customer_id:string|null}; items:Item[] };
type Filter = 'active'|'received'|'needs_confirmation'|'preparing'|'ready'|'partially_delivered'|'delivered'|'cancelled'|'failed';
const labels:Record<string,string>={received:'Recebido',needs_confirmation:'A confirmar',accepted:'Aceite / por preparar',preparing:'Em preparação',ready:'Pronto',partially_delivered:'Parcialmente entregue',delivered:'Entregue',cancelled:'Cancelado',failed:'Não foi possível cumprir',requested:'Pedido',unavailable:'Indisponível',accepted_item:'Aceite',preparing_item:'Em preparação',ready_item:'Pronto'};
const filters:{id:Filter;label:string}[]=[{id:'active',label:'Todos activos'},{id:'received',label:'Recebidos'},{id:'needs_confirmation',label:'A confirmar'},{id:'preparing',label:'Em preparação'},{id:'ready',label:'Prontos'},{id:'partially_delivered',label:'Entrega parcial'}];
const dateTime=(v:string)=>new Intl.DateTimeFormat('pt-PT',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Maputo'}).format(new Date(v));
export default function LojaPedidos(){
 const {shop,role}=useShop(); const qc=useQueryClient(); const [filter,setFilter]=useState<Filter>('active'); const [notes,setNotes]=useState<Record<string,string>>({});
 const allowed=['owner','manager','receptionist'].includes(role??'');
 const q=useQuery({queryKey:['shop-order-queue',shop?.id,filter],enabled:!!shop?.id&&!!shop?.shop_enabled&&allowed,refetchInterval:30000,queryFn:async()=>{
   const {data,error}=await (supabase as any).rpc('get_shop_order_queue',{p_barbershop_id:shop!.id,p_status:filter==='active'?null:filter});
   if(error)throw error; return (data??[]) as Order[];
 }});
 const mutation=useMutation({mutationFn:async(input:{id:string;action:string;note?:string;assignee?:string|null})=>{
   const {error}=await (supabase as any).rpc('update_shop_order_operation',{p_barbershop_id:shop!.id,p_order_id:input.id,p_action:input.action,p_note:input.note??null,p_assigned_to:input.assignee??null});
   if(error)throw error;
 },onSuccess:async()=>{await qc.invalidateQueries({queryKey:['shop-order-queue',shop?.id]});toast.success('Pedido actualizado.');},onError:e=>toast.error(humanError(e))});
 const itemMutation=useMutation({mutationFn:async(input:{orderId:string;itemId:string;action:string;qty?:number;note?:string})=>{
   const {error}=await (supabase as any).rpc('update_shop_order_item_operation',{p_barbershop_id:shop!.id,p_order_id:input.orderId,p_item_id:input.itemId,p_action:input.action,p_delivered_qty:input.qty??null,p_note:input.note??null});
   if(error)throw error;
 },onSuccess:async()=>{await qc.invalidateQueries({queryKey:['shop-order-queue',shop?.id]});toast.success('Artigo actualizado.');},onError:e=>toast.error(humanError(e))});
 const orders=q.data??[];
 const counts=useMemo(()=>orders.reduce((a,o)=>({...a,[o.status]:(a[o.status]??0)+1}),{} as Record<string,number>),[orders]);
 if(!allowed)return <Page title="Pedidos da loja" subtitle="Acesso reservado à gestão e à recepção."><Panel><EmptyState title="Sem permissões" body="Peça acesso ao proprietário da barbearia."/></Panel></Page>;
 if(!shop?.shop_enabled)return <Page title="Pedidos da loja" subtitle="A fila operacional só fica disponível depois da activação segura da Loja."><Panel><EmptyState title="Loja ainda não activada" body="A fila de pedidos está protegida até a reconciliação do schema e a activação por barbearia estarem concluídas."/></Panel></Page>;
 return <Page testId="shop-orders-page" title="Pedidos da loja" subtitle="Prepare, acompanhe e registe cada entrega. O pedido não significa pagamento.">
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
   {[['Por preparar',(counts.received??0)+(counts.accepted??0)],['A confirmar',counts.needs_confirmation??0],['Em preparação',counts.preparing??0],['Prontos',counts.ready??0]].map(([label,value])=><Panel key={String(label)}><p className="t-label text-ink-mid">{label}</p><p className="text-2xl font-semibold mt-2">{value}</p></Panel>)}
  </div>
  <Panel title="Fila operacional" aside={<Button variant="ghost" onClick={()=>void q.refetch()} disabled={q.isFetching}><RefreshCw size={15}/> Actualizar</Button>}>
   <div className="flex gap-2 overflow-x-auto pb-3 mb-3">{filters.map(f=><button key={f.id} type="button" onClick={()=>setFilter(f.id)} aria-pressed={filter===f.id} className={`min-h-10 shrink-0 rounded-xl border px-3 text-sm ${filter===f.id?'border-accent-soft bg-accent-soft/10':'border-white/10 text-ink-mid'}`}>{f.label}</button>)}</div>
   {q.isLoading?<Skeleton lines={5}/>:q.isError?<ErrorState message="Não foi possível carregar a fila de pedidos." onRetry={()=>void q.refetch()}/>:orders.length===0?<EmptyState title="Sem pedidos nesta fila" body="Os novos pedidos aparecerão aqui quando os clientes os associarem a uma marcação."/>:
    <div className="space-y-3">{orders.map(o=><article key={o.id} className="rounded-2xl border border-white/10 p-4" data-testid="shop-order-card">
     <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3"><div><div className="flex items-center gap-2 flex-wrap"><span className="text-xs rounded-full bg-white/10 px-2.5 py-1">{labels[o.status]??o.status}</span><span className="text-sm text-ink-mid">{dateTime(o.appointment.starts_at)}</span></div><h3 className="t-card mt-2">Pedido {o.id.slice(0,8).toUpperCase()}</h3><p className="text-sm text-ink-mid">Marcação {o.appointment.status} · {o.items.length} artigo(s)</p></div>
      <div className="flex flex-wrap gap-2">{o.status==='received'&&<Button onClick={()=>mutation.mutate({id:o.id,action:'accept'})} disabled={mutation.isPending}><Check size={15}/> Aceitar</Button>}{['accepted','preparing'].includes(o.status)&&<Button onClick={()=>mutation.mutate({id:o.id,action:'prepare'})} disabled={mutation.isPending}><Clock3 size={15}/> Preparar</Button>}{o.status==='preparing'&&o.items.every(i=>['ready','delivered'].includes(i.status))&&<Button onClick={()=>mutation.mutate({id:o.id,action:'ready'})} disabled={mutation.isPending}><PackageCheck size={15}/> Marcar pronto</Button>}{!['cancelled','failed','delivered'].includes(o.status)&&<Button variant="ghost" onClick={()=>{const note=window.prompt('Motivo do cancelamento');if(note?.trim())mutation.mutate({id:o.id,action:'cancel',note});}} disabled={mutation.isPending}><X size={15}/> Cancelar</Button>}</div>
     </div>
     <div className="mt-4 divide-y divide-white/10">{o.items.map(i=><div key={i.id} className="py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"><div><p className="font-medium">{i.product_name} · {i.variant}</p><p className="text-sm text-ink-mid">{i.qty} × {formatMT(i.unit_price_minor)} · entregue {i.delivered_qty}/{i.qty}</p>{Array.isArray(i.options)&&i.options.length>0&&<p className="text-xs text-ink-mid mt-1">Preferências: {i.options.map(String).join(', ')}</p>}<p className="text-xs mt-1">{labels[i.status]??i.status}</p></div><div className="flex flex-wrap gap-2">{i.status==='requested'&&<Button variant="secondary" onClick={()=>itemMutation.mutate({orderId:o.id,itemId:i.id,action:'accept'})} disabled={itemMutation.isPending}>Aceitar artigo</Button>}{['accepted','requested'].includes(i.status)&&<Button variant="secondary" onClick={()=>itemMutation.mutate({orderId:o.id,itemId:i.id,action:'prepare'})} disabled={itemMutation.isPending}>Em preparação</Button>}{i.status==='preparing'&&<Button variant="secondary" onClick={()=>itemMutation.mutate({orderId:o.id,itemId:i.id,action:'ready'})} disabled={itemMutation.isPending}>Pronto</Button>}{['ready','partially_delivered'].includes(i.status)&&<Button variant="secondary" onClick={()=>{const raw=window.prompt('Quantidade entregue',String(i.qty-i.delivered_qty));if(raw!==null)itemMutation.mutate({orderId:o.id,itemId:i.id,action:'deliver',qty:Number(raw)});}} disabled={itemMutation.isPending}>Registar entrega</Button>}{!['delivered','cancelled','unavailable'].includes(i.status)&&<Button variant="ghost" onClick={()=>{const note=window.prompt('Motivo da indisponibilidade');if(note?.trim())itemMutation.mutate({orderId:o.id,itemId:i.id,action:'unavailable',note});}} disabled={itemMutation.isPending}>Indisponível</Button>}</div></div>)}</div>
     <div className="mt-3 flex flex-col sm:flex-row gap-2"><Field label="Nota interna" placeholder="Nota interna para a equipa" value={notes[o.id]??o.internal_note??''} onChange={e=>setNotes(s=>({...s,[o.id]:e.target.value}))}/><Button variant="secondary" onClick={()=>mutation.mutate({id:o.id,action:'note',note:notes[o.id]??''})} disabled={mutation.isPending}>Guardar nota</Button></div>
     {o.needs_confirmation_reason&&<p className="text-sm text-amber-300 mt-2">A confirmar: {o.needs_confirmation_reason}</p>}
    </article>)}</div>}
  </Panel>
 </Page>;
}
