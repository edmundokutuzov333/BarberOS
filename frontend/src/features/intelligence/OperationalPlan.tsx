import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Panel, Skeleton, ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { loadOperationalPlan } from './api';
const signals={unknown:'Sem dados',closed:'Sem capacidade registada',busy:'Ocupação elevada',opportunity:'Oportunidade',monitor:'Acompanhar'};
const fmt=(v:number|null,suffix='')=>v===null?'n/d':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(v)+suffix;
export default function OperationalPlan({shopId,userId}:{shopId:string;userId:string}){
 const [open,setOpen]=useState(false);
 const q=useQuery({queryKey:['intelligence-operations',userId,shopId],queryFn:()=>loadOperationalPlan(shopId),enabled:open,staleTime:60_000,retry:false});
 const plan=q.data;
 return <Panel title="Planeamento da próxima semana" testId="intelligence-operations">
 <p className="t-body text-ink-mid mb-3">Compare a capacidade reservada nos próximos sete dias com o histórico de oito semanas. Os minutos indicativos não são vagas garantidas.</p>
 {!open?<Button variant="secondary" onClick={()=>setOpen(true)}>Analisar próxima semana</Button>:<div className="space-y-4">
 <Button size="sm" variant="secondary" loading={q.isFetching} onClick={()=>void q.refetch()}>Actualizar planeamento</Button>
 {q.isPending?<Skeleton lines={4}/>:q.isError?<ErrorState message="Não foi possível analisar a agenda." onRetry={()=>void q.refetch()}/>:plan&&<>
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{plan.days.map(d=><article key={d.date} className="rounded-xl border border-white/10 p-3 min-w-0 space-y-2"><h3 className="font-medium text-ink-hi capitalize">{d.weekday}</h3><p className="t-label text-ink-mid">{d.date}</p><p className="t-body text-ink-hi">{signals[d.signal]}</p>
 <dl className="space-y-1 text-sm">{[['Ocupação reservada',fmt(d.occupancy,'%')],['Ocupação histórica',fmt(d.historicalOccupancy,'%')],['Capacidade',fmt(d.capacity,' min')],['Minutos não reservados*',fmt(d.remaining,' min')]].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-1"><dt className="text-ink-mid">{label}</dt><dd className="text-ink-hi">{value}</dd></div>)}</dl><p className="t-label text-ink-mid">{d.samples} dias históricos comparáveis.</p></article>)}</div>
 <p className="t-label text-ink-mid">*Estimativa agregada. Confirme duração, profissional, pausas, serviços e disponibilidade no motor oficial.</p><Link to="/app/agenda" className="text-accent-soft text-sm inline-flex items-center min-h-11">Consultar agenda real →</Link>
 {plan.campaign&&<div className="rounded-xl border border-white/10 p-4 space-y-2"><h3 className="font-medium text-ink-hi">{plan.campaign.title}</h3><p className="t-body text-ink-mid">{plan.campaign.reason}</p><p className="t-body text-ink-hi">{plan.campaign.body}</p><Button size="sm" variant="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(plan.campaign!.body);toast.success('Texto copiado')}catch{toast.error('Seleccione o texto manualmente.')}}}>Copiar proposta de campanha</Button><p className="t-label text-ink-mid">Não publica nem contacta clientes automaticamente.</p></div>}
 {plan.setup&&!plan.setup.complete&&<div className="rounded-xl border border-white/10 p-4"><h3 className="font-medium text-ink-hi">Configuração por concluir</h3><p className="t-body text-ink-mid mt-2">Progresso registado: {plan.setup.step}/{plan.setup.total}. Próximo passo: {plan.setup.next}.</p><Link to="/app/onboarding" className="text-accent-soft text-sm inline-flex items-center min-h-11">Continuar configuração →</Link></div>}
 </>}</div>}</Panel>
}
