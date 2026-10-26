import { useRef, useState } from 'react';
import { Banknote, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, humanError } from '@/lib/utils';

type Payment = {id:string;amount_minor:number;payment_method:string;confirmation_reference:string|null;confirmation_note:string;confirmed_at:string};
type Item = {id:string;product_name:string;variant:string;qty:number;delivered_qty:number;delivered_value_minor:number};
type ShopOrderPayment = {id:string;status:string;appointment_starts_at:string;due_minor:number;paid_minor:number;balance_minor:number;items:Item[];payments:Payment[]};
type Method = 'cash'|'pos'|'mpesa'|'emola'|'bank_transfer'|'other';
const methods:{value:Method;label:string}[]=[{value:'cash',label:'Numerário'},{value:'pos',label:'POS'},{value:'mpesa',label:'M-Pesa'},{value:'emola',label:'e-Mola'},{value:'bank_transfer',label:'Transferência bancária'},{value:'other',label:'Outro'}];
const stamp=(v:string)=>new Intl.DateTimeFormat('pt-PT',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Maputo'}).format(new Date(v));

export default function LojaPagamentos(){
 const {shop,role}=useShop();const qc=useQueryClient();
 const [amounts,setAmounts]=useState<Record<string,string>>({});
 const [selectedMethods,setSelectedMethods]=useState<Record<string,Method>>({});
 const [references,setReferences]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const operationKeys=useRef<Record<string,string>>({});
 const allowed=!!shop?.id&&!!shop?.shop_enabled&&['owner','manager'].includes(role??'');
 const orders=useQuery({queryKey:['shop-order-payment-queue',shop?.id],enabled:allowed,retry:false,refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await (supabase as any).rpc('get_shop_order_payment_queue',{p_barbershop_id:shop!.id});
  if(error)throw error;return (data??[]) as ShopOrderPayment[];
 }});
 const record=useMutation({mutationFn:async(p:{order:ShopOrderPayment;amount:number;method:Method;reference:string;note:string;key:string})=>{
  const {data,error}=await (supabase as any).rpc('record_shop_order_payment',{
   p_barbershop_id:shop!.id,p_order_id:p.order.id,p_amount_minor:p.amount,p_payment_method:p.method,
   p_confirmation_reference:p.reference||null,p_confirmation_note:p.note,p_idempotency_key:p.key
  });
  if(error)throw error;if(!data?.payment_id)throw new Error('O servidor não confirmou o registo.');
 },onSuccess:async(_d,p)=>{
  delete operationKeys.current[p.order.id];setAmounts(s=>({...s,[p.order.id]:''}));setReferences(s=>({...s,[p.order.id]:''}));setNotes(s=>({...s,[p.order.id]:''}));
  await Promise.all([qc.invalidateQueries({queryKey:['shop-order-payment-queue',shop?.id]}),qc.invalidateQueries({queryKey:['shop-phase6-report',shop?.id]})]);
  toast.success('Recebimento registado. A confirmação do provider não é automática.');
 },onError:e=>toast.error(humanError(e))});
 const submit=(event:React.FormEvent<HTMLFormElement>,order:ShopOrderPayment)=>{
  event.preventDefault();const value=Number((amounts[order.id]??'').trim().replace(',','.'));
  if(!Number.isFinite(value)||value<=0){toast.error('Indique um valor positivo em MT.');return;}
  const amount=Math.round(value*100);if(amount>order.balance_minor){toast.error('O valor excede o saldo por pagar.');return;}
  const method=selectedMethods[order.id]??'cash',reference=(references[order.id]??'').trim(),note=(notes[order.id]??'').trim();
  if(note.length<12){toast.error('Descreva a evidência da confirmação (mínimo 12 caracteres).');return;}
  if(['pos','mpesa','emola','bank_transfer'].includes(method)&&reference.length<3){toast.error('Indique a referência confirmada.');return;}
  const key=operationKeys.current[order.id]??crypto.randomUUID();operationKeys.current[order.id]=key;
  record.mutate({order,amount,method,reference,note,key});
 };
 if(!shop?.shop_enabled)return <Page title="Pagamentos da Loja"><Panel><p className="text-sm text-ink-mid">A Loja está desactivada. O registo de pagamentos fica bloqueado até à aprovação operacional.</p></Panel></Page>;
 if(!allowed)return <Page title="Pagamentos da Loja"><Panel><p className="text-sm text-ink-mid">Acesso reservado ao proprietário e ao gestor.</p></Panel></Page>;
 return <Page testId="shop-order-payments-page" title="Pagamentos da Loja" subtitle="Registe recebimentos apenas para artigos entregues. Este ledger não altera pagamentos de serviços nem confirma automaticamente operações externas.">
  <Panel><div className="flex gap-3"><ShieldCheck size={20}/><div><h2 className="font-semibold text-ink-hi">Confirme antes de registar</h2><p className="mt-1 text-sm text-ink-mid">Confirme o numerário contado ou verifique primeiro o recibo/estado oficial de POS, M-Pesa, e-Mola ou banco. A referência escrita pelo operador não equivale a reconciliação automática do provider.</p></div></div></Panel>
  <div className="flex justify-end"><Button variant="secondary" disabled={orders.isFetching} onClick={()=>void orders.refetch()}><RefreshCw size={16}/> Actualizar</Button></div>
  {orders.isLoading?<Skeleton lines={5}/>:orders.isError?<ErrorState message={humanError(orders.error)} onRetry={()=>void orders.refetch()}/>:!orders.data?.length?<EmptyState title="Sem entregas recentes ou saldos em aberto" body="Pedidos com artigos entregues e saldos pendentes aparecerão aqui. Entrega não significa pagamento."/>:
   <div className="space-y-4">{orders.data.map(order=><Panel key={order.id}>
    <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-ink-mid">{order.status==='delivered'?'Entregue':'Entrega parcial'} · {stamp(order.appointment_starts_at)}</p><h2 className="mt-1 font-semibold">Pedido {order.id.slice(0,8).toUpperCase()}</h2></div><div className="flex gap-4 text-right"><div><p className="text-xs text-ink-mid">Entregue</p><p>{formatMT(order.due_minor)}</p></div><div><p className="text-xs text-ink-mid">Recebido</p><p>{formatMT(order.paid_minor)}</p></div><div><p className="text-xs text-ink-mid">Em falta</p><p className="font-semibold">{formatMT(order.balance_minor)}</p></div></div></div>
    <div className="mt-3 divide-y divide-white/10">{order.items.map(i=><div key={i.id} className="flex justify-between gap-2 py-2 text-sm"><span>{i.product_name} · {i.variant} · {i.delivered_qty}/{i.qty} entregue(s)</span><span>{formatMT(i.delivered_value_minor)}</span></div>)}</div>
    {order.payments.length>0&&<div className="mt-3"><p className="text-sm font-medium">Histórico</p>{order.payments.map(p=><div className="mt-2 rounded-xl border border-white/10 p-3" key={p.id}><div className="flex justify-between gap-3"><span>{methods.find(m=>m.value===p.payment_method)?.label??p.payment_method}</span><strong>{formatMT(p.amount_minor)}</strong></div><p className="mt-1 text-xs text-ink-mid">{stamp(p.confirmed_at)} · {p.confirmation_reference??'Sem referência externa'}</p><p className="mt-1 text-sm">{p.confirmation_note}</p></div>)}</div>}
    {order.balance_minor>0?<form className="mt-4 space-y-3 border-t border-white/10 pt-4" onSubmit={e=>submit(e,order)}>
     <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="flex flex-col gap-1 text-sm text-ink-mid">Montante em MT<input className="field" type="number" min="0.01" step="0.01" max={(order.balance_minor/100).toFixed(2)} value={amounts[order.id]??''} onChange={e=>setAmounts(s=>({...s,[order.id]:e.target.value}))} required/></label>
      <label className="flex flex-col gap-1 text-sm text-ink-mid">Meio<select className="field" value={selectedMethods[order.id]??'cash'} onChange={e=>setSelectedMethods(s=>({...s,[order.id]:e.target.value as Method}))}>{methods.map(m=><option value={m.value} key={m.value}>{m.label}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm text-ink-mid">Referência<input className="field" maxLength={160} value={references[order.id]??''} onChange={e=>setReferences(s=>({...s,[order.id]:e.target.value}))} placeholder="N.º recibo/transacção"/></label>
      <label className="flex flex-col gap-1 text-sm text-ink-mid">Evidência / nota<input className="field" minLength={12} maxLength={500} value={notes[order.id]??''} onChange={e=>setNotes(s=>({...s,[order.id]:e.target.value}))} placeholder="Descreva a confirmação" required/></label>
     </div>
     <div className="flex justify-end"><Button type="submit" loading={record.isPending} disabled={record.isPending}><Banknote size={16}/> Registar recebimento</Button></div>
    </form>:<p className="mt-4 text-sm text-ink-mid">O valor entregue está totalmente liquidado segundo os registos da barbearia.</p>}
   </Panel>)}</div>}
 </Page>;
}
