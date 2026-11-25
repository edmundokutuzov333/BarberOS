import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {Panel,Skeleton,ErrorState,EmptyState} from '@/components/ui/States';
import {Button} from '@/components/ui/Button';
import {formatMT} from '@/lib/utils';
import {loadFinancialIntelligence} from './api';
const cash=(n:number|null)=>n===null?'n/d':formatMT(n);
const num=(n:number|null,suffix='')=>n===null?'n/d':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(n)+suffix;
export default function FinancialIntelligence({shopId,userId}:{shopId:string;userId:string}){
 const [open,setOpen]=useState(false);const [days,setDays]=useState<7|30>(7);
 const q=useQuery({queryKey:['intelligence-finance',shopId,userId,days],queryFn:()=>loadFinancialIntelligence(shopId,days),enabled:open,retry:false,staleTime:30000});
 const a=q.data;
 return <Panel title="Inteligência financeira" testId="finance-intelligence" className="mb-4">
 <p className="t-body text-ink-mid mb-3">Compare períodos completos, comissões históricas, receitas de serviços e custos conhecidos da loja. Não substitui contabilidade.</p>
 {!open?<Button variant="secondary" onClick={()=>setOpen(true)}>Analisar finanças</Button>:<div className="space-y-4">
 <div className="flex flex-wrap gap-2">{([7,30] as const).map(d=><Button key={d} size="sm" variant={days===d?'primary':'secondary'} aria-pressed={days===d} onClick={()=>setDays(d)}>{d} dias</Button>)}<Button size="sm" variant="secondary" loading={q.isFetching} onClick={()=>void q.refetch()}>Actualizar análise</Button></div>
 {q.isPending?<Skeleton lines={4}/>:q.isError?<ErrorState message="Não foi possível calcular os indicadores financeiros." onRetry={()=>void q.refetch()}/>:a&&<>
 <p className="t-label text-ink-mid">{a.from} — {a.to} · comparação: {a.previousFrom} — {a.previousTo}. Período independente do filtro de relatórios.</p>
 <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[['Receita estimada',cash(a.revenue)],['Variação da receita',num(a.revenueChange,'%')],['Ticket médio',cash(a.ticket)],['Variação do ticket',num(a.ticketChange,'%')],['Comissões conhecidas',cash(a.commissionKnown)],['Atendimentos sem comissão conhecida',num(a.commissionUnknown)],['Receita após comissões*',cash(a.afterCommission)],['Gorjetas registadas (separadas)',cash(a.tips)],['Ocupação',num(a.occupancy,'%')]].map(([l,v])=><div key={l} className="rounded-xl border border-white/10 p-3 min-w-0"><p className="t-label text-ink-mid">{l}</p><p className="text-xl text-ink-hi break-words mt-1">{v}</p></div>)}</div>
 <p className="t-label text-ink-mid">*Apenas quando todas as comissões estão conhecidas e os totais coincidem. Não desconta salários, renda, impostos, consumíveis ou outros custos; não é lucro nem dinheiro recebido. Gorjetas não são receita de serviços.</p>
 {a.insights.length>0&&<div className="space-y-2"><h3 className="font-medium text-ink-hi">Pontos a verificar</h3>{a.insights.map(i=><p className="t-body text-ink-mid border-l border-accent-soft pl-3" key={i.id}>{i.text}</p>)}</div>}
 <h3 className="font-medium text-ink-hi">Receita por serviço · até 20</h3>
 {!a.serviceConsistent?<p className="t-body text-ink-mid">Os totais por serviço não coincidem com o resumo. A decomposição foi omitida.</p>:a.services.length===0?<EmptyState title="Sem serviços concluídos"/>:<div className="space-y-2">{a.services.map(s=><div key={s.id} className="rounded-xl border border-white/10 p-3"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium break-words">{s.name}</span><span>{cash(s.revenue)}</span></div><p className="t-label text-ink-mid mt-1">{num(s.completed)} atendimentos · {num(s.share,'%')} da receita · ticket {cash(s.ticket)}</p></div>)}</div>}
 <h3 className="font-medium text-ink-hi">Equipa · até 30 profissionais</h3>
 {!a.team.length?<EmptyState title="Sem profissionais no relatório"/>:<div className="grid sm:grid-cols-2 gap-2">{a.team.map(t=><div key={t.id} className="rounded-xl border border-white/10 p-3"><h4 className="font-medium break-words">{t.name}</h4><p className="t-body mt-1">{num(t.completed)} concluídos · ocupação {num(t.occupancy,'%')}</p><p className="t-label text-ink-mid">Receita {cash(t.revenue)} · comissão {cash(t.commission)}</p><p className="t-label text-ink-mid">Após comissão: {cash(t.afterCommission)}</p></div>)}</div>}
 <p className="t-label text-ink-mid">Não classifica funcionários: compare horários, capacidade e tipos de serviço.</p>
 {a.store&&<div className="rounded-xl border border-white/10 p-3 space-y-2"><h3 className="font-medium">Loja · margem bruta conhecida</h3><p className="t-body">Custo conhecido: {cash(a.store.knownCost)} · margem conhecida: {cash(a.store.knownGrossMargin)}</p><p className="t-label text-ink-mid">{num(a.store.knownUnits)} unidades com custo · {num(a.store.unknownUnits)} sem custo. {a.store.complete?'Cobertura completa das unidades entregues desta coorte.':'Margem parcial ou indisponível.'} Pedidos criados no período (fuso Maputo), não fluxo de caixa. Não somar à receita após comissão.</p><Link to="/app/loja/relatorios" className="text-accent-soft text-sm inline-flex min-h-11 items-center">Consultar relatórios da loja →</Link></div>}
 </>}</div>}</Panel>
}
