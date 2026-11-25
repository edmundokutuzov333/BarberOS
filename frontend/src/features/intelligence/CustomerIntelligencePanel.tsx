import { useQuery } from '@tanstack/react-query';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Panel, ErrorState, Skeleton } from '@/components/ui/States';
import { loadCustomerIntelligence } from './api';

const statusLabels={scheduled:'Já tem marcação',insufficient:'Histórico insuficiente',overdue:'Retorno acima do ciclo habitual',due:'Na altura habitual de regressar',regular:'Dentro do ciclo habitual'};
export default function CustomerIntelligencePanel({shopId,customerId,userId}:{shopId:string;customerId:string;userId:string}){
  const [open,setOpen]=useState(false);
  const q=useQuery({queryKey:['intelligence-customer',userId,shopId,customerId],queryFn:()=>loadCustomerIntelligence(shopId,customerId),enabled:open,staleTime:30_000,retry:false});
  const a=q.data;
  return <Panel title="Inteligência do cliente" testId="customer-intelligence-panel" aside={<Sparkles size={18} className="text-accent-soft" aria-hidden/>}>
    <p className="t-body text-ink-mid">Analise o histórico para preparar um atendimento ou avaliar uma oportunidade de retorno. Não envia mensagens nem altera a ficha.</p>
    {!open?<Button className="mt-3" variant="secondary" onClick={()=>setOpen(true)}>Analisar histórico</Button>:<div className="mt-3 space-y-4">
      <Button variant="secondary" size="sm" loading={q.isFetching} onClick={()=>void q.refetch()}><RefreshCw size={15}/> Actualizar análise</Button>
      {q.isPending?<Skeleton lines={3}/>:q.isError?<ErrorState message="Não foi possível analisar o histórico deste cliente." onRetry={()=>void q.refetch()}/>:a&&<>
        <p role="status" className="text-ink-hi font-medium">{statusLabels[a.returnStatus]}</p>
        <dl className="grid grid-cols-2 gap-3">{[
          ['Ciclo habitual',a.cycleDays===null?'n/d':a.cycleDays+' dias'],
          ['Última visita',a.lastVisit??'n/d'],
          ['Dias desde a visita',a.daysSinceVisit===null?'n/d':String(a.daysSinceVisit)],
          ['Retorno indicativo',a.indicativeReturnDate??'n/d'],
          ['Serviço mais frequente',a.frequentService?.label??'n/d'],
          ['Corte mais frequente',a.frequentHaircut?.label??'n/d'],
          ['Último serviço',a.lastService??'n/d'],
          ['Taxa histórica de faltas',a.noShowRate===null?'n/d':a.noShowRate+'%']
        ].map(([label,value])=><div key={label} className="min-w-0 rounded-xl border border-white/10 p-3"><dt className="t-label text-ink-mid">{label}</dt><dd className="t-body text-ink-hi mt-1 break-words">{value}</dd></div>)}</dl>
        {a.risk==='review'&&<p className="t-body text-ink-mid">O histórico indica faltas recorrentes. Confirme os lembretes com o cliente; não penalize nem recuse marcações automaticamente.</p>}
        {a.draft&&<div className="rounded-xl border border-white/10 p-3 space-y-2"><h3 className="font-medium text-ink-hi">Mensagem sugerida</h3><p className="t-body text-ink-mid break-words">{a.draft}</p><p className="t-label text-ink-mid">Confirme o consentimento e reveja o texto antes de contactar. Nada é enviado automaticamente.</p><Button variant="secondary" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(a.draft!);toast.success('Mensagem copiada')}catch{toast.error('Não foi possível copiar. Seleccione o texto manualmente.')}}}>Copiar mensagem</Button></div>}
        <p className="t-label text-ink-mid">Até 100 marcações recentes; {a.historyCount} analisadas, {a.cycleSamples} intervalos de visita e {a.resolved} atendimentos concluídos ou faltas. A data é indicativa, não uma marcação nem uma previsão garantida.</p>
      </>}
    </div>}
  </Panel>
}
