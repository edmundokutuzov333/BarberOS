import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Panel, Skeleton, ErrorState, EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { loadInventoryIntelligence, loadReviewIntelligence } from './api';
const fmt=(v:number|null)=>v===null?'n/d':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(v);
const signals={out:'Sem stock',low:'Stock baixo',watch:'Acompanhar reposição',ok:'Sem alerta'};
export function InventoryIntelligence({shopId,userId}:{shopId:string;userId:string}){
 const [open,setOpen]=useState(false);
 const q=useQuery({queryKey:['intelligence-inventory',shopId,userId],queryFn:()=>loadInventoryIntelligence(shopId),enabled:open,retry:false,staleTime:30_000});
 const data=q.data;
 return <Panel title="Inteligência de stock" testId="inventory-intelligence" className="mb-4">
 <p className="t-body text-ink-mid mb-3">Analise as saídas por venda registadas nos últimos 30 dias e prepare a reposição. Não altera stock nem faz encomendas.</p>
 {!open?<Button variant="secondary" onClick={()=>setOpen(true)}>Analisar stock</Button>:<div className="space-y-3">
 <Button size="sm" variant="secondary" loading={q.isFetching} onClick={()=>void q.refetch()}>Actualizar análise</Button>
 {q.isPending?<Skeleton lines={3}/>:q.isError?<ErrorState message="Não foi possível analisar o stock. Confirme a configuração da loja ou tente novamente." onRetry={()=>void q.refetch()}/>:data&&<>
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[['Variantes controladas',data.trackedCount],['Com alerta',data.alertCount],['Com estimativa',data.estimatedCount]].map(([label,value])=><div className="rounded-xl border border-white/10 p-3" key={label}><p className="t-label text-ink-mid">{label}</p><p className="text-xl text-ink-hi">{value}</p></div>)}</div>
 {!data.rows.length?<EmptyState title="Sem variantes activas com controlo de stock" body="Active e configure os produtos para acompanhar as existências."/>:<div className="space-y-2">{data.rows.map(r=><article key={r.id} className="rounded-xl border border-white/10 p-3 min-w-0"><h3 className="font-medium text-ink-hi break-words">{r.product} · {r.variant}</h3><p className="t-label text-accent-soft mt-1">{signals[r.signal]}</p><dl className="grid grid-cols-2 gap-2 text-sm mt-2">{[['Stock físico registado',r.stock],['Limite de alerta',r.threshold],['Saídas por venda',r.sold],['Cobertura indicativa (dias)',fmt(r.coverDays)],['Reposição indicativa (un.)',fmt(r.suggestedUnits)],['Dias com vendas',r.saleDays]].map(([label,value])=><div key={label}><dt className="text-ink-mid">{label}</dt><dd className="text-ink-hi">{value}</dd></div>)}</dl></article>)}</div>}
 <p className="t-label text-ink-mid">Até 50 variantes, ordenadas por prioridade. A reposição visa 14 dias de consumo bruto histórico e o limite de alerta. Exige variantes e produtos com pelo menos 30 dias, cinco unidades vendidas e três dias com vendas. Não desconta reservas, não estima procura perdida nem considera prazos de fornecedores. Confirme stock físico e encomendas existentes.</p>
 </>}</div>}</Panel>
}
export function ReviewIntelligence({shopId,userId}:{shopId:string;userId:string}){
 const [open,setOpen]=useState(false);
 const q=useQuery({queryKey:['intelligence-reviews',shopId,userId],queryFn:()=>loadReviewIntelligence(shopId),enabled:open,retry:false,staleTime:30_000});
 const data=q.data;
 return <Panel title="Inteligência de avaliações" testId="review-intelligence" className="mb-4">
 <p className="t-body text-ink-mid mb-3">Resumo das últimas 100 avaliações, incluindo ocultas. Nenhum comentário sai do BarberOS.</p>
 {!open?<Button variant="secondary" onClick={()=>setOpen(true)}>Analisar avaliações</Button>:<div className="space-y-3">
 <Button size="sm" variant="secondary" loading={q.isFetching} onClick={()=>void q.refetch()}>Actualizar análise</Button>
 {q.isPending?<Skeleton lines={3}/>:q.isError?<ErrorState message="Não foi possível analisar as avaliações." onRetry={()=>void q.refetch()}/>:data&&<>
 {data.sampleCount===0?<EmptyState title="Ainda sem avaliações" body="A análise ficará disponível quando houver feedback."/>:<>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['Média (de 5)',fmt(data.average)],['4–5 estrelas',data.positive],['3 estrelas',data.neutral],['1–2 estrelas',data.negative]].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 p-3"><p className="t-label text-ink-mid">{label}</p><p className="text-xl text-ink-hi">{value}</p></div>)}</div>
 <div className="space-y-2">{[...data.stars].reverse().map(s=><div key={s.rating} className="flex items-center gap-3 text-sm"><span className="w-16 shrink-0">{s.rating} estrelas</span><progress className="flex-1 min-w-0 h-2 accent-accent-soft" max={data.sampleCount} value={s.count} aria-label={s.rating+' estrelas: '+s.count}/><span>{s.count}</span></div>)}</div>
 <h3 className="font-medium text-ink-hi">Temas mencionados</h3>
 {data.topics.length===0?<p className="t-body text-ink-mid">Sem palavras-chave identificadas.</p>:data.topics.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-2 border-b border-white/10 pb-2"><span>{t.label}</span><span className="t-label text-ink-mid">{t.mentions} menções · {t.lowRated} em avaliações de 1–2 estrelas</span></div>)}
 <p className="t-label text-ink-mid">{data.sampleCount} avaliações, {data.commentCount} com comentário. As menções são correspondências de palavras, não interpretação semântica ou atribuição de culpa. Uma avaliação pode mencionar vários temas.</p>
 {data.reply&&<div className="rounded-xl border border-white/10 p-3 space-y-2"><h3 className="font-medium text-ink-hi">Modelo de resposta para revisão</h3><p className="t-body text-ink-mid">{data.reply}</p><Button variant="secondary" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(data.reply!);toast.success('Texto copiado')}catch{toast.error('Seleccione o texto manualmente.')}}}>Copiar modelo</Button><p className="t-label text-ink-mid">Adapte à avaliação concreta. Não publica nem envia automaticamente.</p></div>}
 </>}</>}</div>}</Panel>
}
