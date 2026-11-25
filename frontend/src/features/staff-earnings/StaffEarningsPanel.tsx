import {useState,type FormEvent} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Field} from '@/components/ui/Field';
import {Button} from '@/components/ui/Button';
import {EmptyState,ErrorState,Panel,Skeleton} from '@/components/ui/States';
import {formatMT,humanError} from '@/lib/utils';
import {useShop} from '@/lib/shop';
import {getStaffEarnings,setCommissionRate,recordTip,parseStaffDecimal,type StaffRate,type StaffAppointment} from './api';

function RateEditor({shop,rate,onSaved}:{shop:string;rate:StaffRate;onSaved:()=>Promise<unknown>}){
 const [value,setValue]=useState(rate.rate_bps===null?'':(rate.rate_bps/100).toFixed(2));
 const save=useMutation({mutationFn:()=>setCommissionRate(shop,rate.barber_id,parseStaffDecimal(value,10000)),onSuccess:async()=>{await onSaved();toast.success('Comissão guardada.');},onError:e=>toast.error(humanError(e))});
 return <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end border-b border-white/10 py-3" onSubmit={e=>{e.preventDefault();save.mutate();}}><p className="font-medium break-words self-center">{rate.name}</p><Field label="Comissão (%)" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} required hint={rate.rate_bps===null?'Não definida':'Actual: '+rate.rate_bps/100+'%'}/><Button type="submit" loading={save.isPending}>Guardar</Button></form>;
}
function TipEditor({shop,item,onSaved}:{shop:string;item:StaffAppointment;onSaved:()=>Promise<unknown>}){
 const [value,setValue]=useState((item.tip_minor/100).toFixed(2));
 const [reason,setReason]=useState('');
 const save=useMutation({mutationFn:()=>recordTip(shop,item.id,parseStaffDecimal(value,1000000000),item.tip_minor,reason.trim()),onSuccess:async()=>{setReason('');await onSaved();toast.success('Gorjeta registada.');},onError:e=>toast.error(humanError(e))});
 const submit=(e:FormEvent)=>{e.preventDefault();if(reason.trim().length<3)return toast.error('Indique o motivo do registo.');save.mutate();};
 return <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2 items-end mt-3"><Field label="Gorjeta total (MT)" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} required/><Field label="Motivo / referência" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} required minLength={3}/><Button type="submit" className="sm:col-span-2 justify-self-start" loading={save.isPending}>Guardar gorjeta</Button></form>;
}
const dateKey=(tz:string)=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('-');};
export default function StaffEarningsPanel({range,settings=false}:{range?:{from:string;to:string};settings?:boolean}){
 const {shop,role}=useShop();
 if(!shop)return null;
 return <StaffWorkspace key={shop.id+':'+(range?.from??'')+':'+(range?.to??'')} shopId={shop.id} timezone={shop.timezone} management={role==='owner'||role==='manager'} range={range} settings={settings}/>;
}
function StaffWorkspace({shopId,timezone,management,range,settings}:{shopId:string;timezone:string;management:boolean;range?:{from:string;to:string};settings:boolean}){
 const today=dateKey(timezone);
 const from=range?.from??today.slice(0,7)+'-01',to=range?.to??today;
 const [offset,setOffset]=useState(0);
 const qc=useQueryClient();
 const q=useQuery({queryKey:['staff-earnings',shopId,from,to,offset],queryFn:()=>getStaffEarnings(shopId,from,to,offset),retry:false,refetchOnWindowFocus:true});
 const refresh=()=>qc.invalidateQueries({queryKey:['staff-earnings',shopId]});
 if(q.isLoading)return <Skeleton/>;
 if(q.error)return <ErrorState message={humanError(q.error)} onRetry={()=>void q.refetch()}/>;
 if(!q.data)return <EmptyState title="Comissões e gorjetas indisponíveis neste ambiente" body="A base de dados ainda não recebeu a actualização operacional."/>;
 const data=q.data;
 return <div className="space-y-4" data-testid="staff-earnings">
 <p className="t-body text-ink-mid">A comissão é calculada sobre o preço do serviço concluído, à taxa vigente no momento da conclusão. Não é um pagamento nem um cálculo salarial. A gorjeta registada pertence integralmente ao barbeiro e não entra na base de comissão.</p>
 {settings&&management&&<section aria-label="Taxas por barbeiro"><h3 className="t-card">Comissão por barbeiro</h3><p className="t-label text-ink-mid mt-1">A alteração só afecta atendimentos concluídos depois de guardar.</p>{data.rates.length?data.rates.map(rate=><RateEditor key={rate.barber_id+':'+rate.rate_bps} shop={shopId} rate={rate} onSaved={refresh}/>):<EmptyState title="Sem barbeiros activos"/>}</section>}
 <Panel title="Comissões e gorjetas por barbeiro"><p className="t-label text-ink-mid mb-3">Período: {from} a {to} · pela data da marcação.</p>{data.summary.length?data.summary.map(r=><div key={r.barber_id} className="grid grid-cols-2 sm:grid-cols-3 gap-2 border-b border-white/10 py-3"><p className="font-medium col-span-2 sm:col-span-1 break-words">{r.name}<span className="block t-label text-ink-mid">{r.completed_count} concluído(s) · {r.unknown_count} sem taxa histórica</span></p><div><p className="t-label text-ink-mid">Comissão conhecida</p><p>{r.unknown_count===r.completed_count?'—':formatMT(r.commission_minor)}</p></div><div><p className="t-label text-ink-mid">Gorjetas</p><p>{formatMT(r.tip_minor)}</p></div></div>):<EmptyState title="Sem atendimentos concluídos no período"/>}</Panel>
 <Panel title="Atendimentos concluídos">{data.appointments.map(a=><details key={a.id+':'+a.tip_minor} className="border-b border-white/10 py-3"><summary className="cursor-pointer min-h-11"><span className="font-medium">{a.display_name}</span><span className="block t-label text-ink-mid">{new Intl.DateTimeFormat('pt-PT',{timeZone:timezone,dateStyle:'short',timeStyle:'short'}).format(new Date(a.starts_at))} · Serviço {formatMT(a.price_cents)} · Ref. {a.id.slice(0,8)}</span></summary><p className="t-body">Comissão: {a.commission_minor===null?'Não registada':formatMT(a.commission_minor)} · Gorjeta: {formatMT(a.tip_minor)}</p>{management&&<TipEditor shop={shopId} item={a} onSaved={refresh}/>}</details>)}{data.total===0&&<EmptyState title="Sem registos"/>}{data.total>50&&<div className="flex flex-wrap items-center justify-between gap-2 mt-3"><Button variant="secondary" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-50))}>Anterior</Button><span className="t-label">{offset+1}–{Math.min(offset+50,data.total)} de {data.total}</span><Button variant="secondary" disabled={offset+50>=data.total} onClick={()=>setOffset(v=>v+50)}>Seguinte</Button></div>}</Panel>
 </div>;
}
