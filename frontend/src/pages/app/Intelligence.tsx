import { useState } from 'react';
import VoiceQuestion from '@/features/intelligence/VoiceQuestion';
import FinancialIntelligence from '@/features/intelligence/FinancialIntelligence';
import OperationalPlan from '@/features/intelligence/OperationalPlan';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Panel, Skeleton, ErrorState, EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { useShop } from '@/lib/shop';
import { useAuth } from '@/lib/auth';
import { formatMT } from '@/lib/utils';
import { loadIntelligence, topics, labels, type Topic } from '@/features/intelligence/api';

const num=(v:number|null)=>v===null?'n/d':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(v);
const percent=(v:number|null)=>v===null?'n/d':num(v)+'%';

function Workspace({shopId,userId}:{shopId:string;userId:string}){
  const [days,setDays]=useState<7|30>(7);
  const [topic,setTopic]=useState<Topic>('overview');
  const [question,setQuestion]=useState('');
  const [voiceBusy,setVoiceBusy]=useState(false);
  const [history,setHistory]=useState<{question:string;answer:string;advice:string|null;topic:Topic}[]>([]);
  const contextTopic=history.at(-1)?.topic;
  const resetConversation=()=>{ask.reset();setHistory([]);setQuestion('')};
  const q=useQuery({queryKey:['intelligence',userId,shopId,days,topic],queryFn:()=>loadIntelligence(shopId,days,topic),staleTime:60_000,retry:false});
  const ask=useMutation({mutationFn:(input:{question?:string;cloud?:boolean})=>loadIntelligence(shopId,days,input.question?topic:contextTopic??topic,input.question,input.cloud,contextTopic),retry:false,onSuccess:(response,input)=>{setHistory(h=>[...h,{question:input.question||labels[response.topic],answer:response.answer,advice:response.cloud.advice,topic:response.topic}].slice(-12));setQuestion('')}});
  const data=q.data;
  return <Page title="Inteligência de gestão" subtitle="Dados reais da sua barbearia, prioridades e recomendações práticas." testId="intelligence-page" actions={<Button variant="secondary" onClick={()=>{ask.reset();void q.refetch()}} disabled={ask.isPending||voiceBusy} loading={q.isFetching}><RefreshCw size={16}/> Actualizar</Button>}>
    <div className="space-y-4 min-w-0">
      <Panel title="Período de análise">
        <p className="t-body text-ink-mid mb-3">Dias completos anteriores a hoje, comparados com um período de igual duração.</p>
        <div className="flex flex-wrap gap-2">{([7,30] as const).map(d=><Button key={d} variant={days===d?'primary':'secondary'} aria-pressed={days===d} disabled={ask.isPending||voiceBusy} onClick={()=>{resetConversation();setDays(d)}}>{d} dias</Button>)}</div>
      </Panel>
      <Panel title="Assistente de gestão" aside={<Sparkles size={18} className="text-accent-soft" aria-hidden/>}>
        <p className="t-body text-ink-mid mb-3">Escolha um tema ou escreva uma pergunta sobre gestão. Pode continuar uma consulta com perguntas de seguimento. O contexto conserva o último tema; os indicadores são calculados no servidor.</p>
        <div className="flex flex-wrap gap-2 mb-4">{topics.map(t=><Button key={t} size="sm" variant={topic===t?'primary':'secondary'} aria-pressed={topic===t} disabled={ask.isPending||voiceBusy} onClick={()=>{resetConversation();setTopic(t)}}>{labels[t]}</Button>)}</div>
        <div className="flex flex-wrap gap-2 mb-3" aria-label="Perguntas sugeridas">{['Quanto em comissões?','Qual o ticket médio?','Como estão as avaliações?','Quais produtos devo repor?','Como está a próxima semana?'].map(prompt=><Button key={prompt} size="sm" variant="ghost" disabled={ask.isPending||voiceBusy} onClick={()=>setQuestion(prompt)}>{prompt}</Button>)}</div>
        <form className="space-y-2" onSubmit={e=>{e.preventDefault();if(!voiceBusy&&!ask.isPending&&question.trim())ask.mutate({question:question.trim()})}}>
          <label className="t-label text-ink-mid" htmlFor="intelligence-question">Pergunta (não inclua dados pessoais)</label>
          <textarea id="intelligence-question" value={question} disabled={voiceBusy||ask.isPending} onChange={e=>setQuestion(e.target.value)} maxLength={300} rows={2} placeholder="Como posso melhorar a ocupação da agenda?" className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 text-ink-hi focus-visible:ring-2 focus-visible:ring-accent-soft"/>
          <Button type="submit" loading={ask.isPending} disabled={!question.trim()||q.isPending||voiceBusy}>Consultar</Button>
          {data&&data.cloud.status!=='disabled'&&<VoiceQuestion shopId={shopId} disabled={ask.isPending||Boolean(question.trim())} onText={setQuestion} onBusy={setVoiceBusy}/>}
        </form>
        {ask.isError&&<div className="mt-3"><ErrorState message="Não foi possível concluir a consulta." onRetry={()=>ask.mutate({question:question.trim()||undefined})}/></div>}
        <div className="mt-4 space-y-3" aria-live="polite">{history.length===0?<p className="t-body text-ink-hi whitespace-pre-wrap break-words">{data?.answer??''}</p>:history.map((turn,i)=><article key={i} className="rounded-xl border border-white/10 p-3 space-y-2 min-w-0"><p className="t-label text-ink-mid">{labels[turn.topic]}</p><p className="font-medium break-words">{turn.question}</p><p className="t-body text-ink-hi whitespace-pre-wrap break-words">{turn.answer}</p>{turn.advice&&<><p className="t-label text-accent-soft">Acções seleccionadas pela Groq</p><p className="t-body whitespace-pre-wrap break-words">{turn.advice}</p></>}</article>)}</div>{history.length>0&&<Button size="sm" variant="ghost" disabled={ask.isPending||voiceBusy} onClick={resetConversation}>Nova conversa</Button>}
        {data&&data.cloud.status!=='disabled'&&<div className="mt-4"><Button variant="secondary" loading={ask.isPending} disabled={voiceBusy} onClick={()=>ask.mutate({cloud:true,question:question.trim()||undefined})}>Consultar com Groq</Button><p className="t-label text-ink-mid mt-2">A Groq recebe apenas o tema, intenção e sinais operacionais qualitativos, sem nomes, valores, contactos ou o texto da pergunta.</p></div>}
        {['quota','unavailable'].includes(ask.data?.cloud.status??'')&&<p role="status" className="mt-3 t-body text-ink-mid">IA externa indisponível. As recomendações de gestão continuam activas.</p>}
        {data?.cloud.status==='disabled'&&<p className="t-label text-ink-mid mt-3">Modo de inteligência própria activo. IA generativa externa não configurada.</p>}
      </Panel>
      {q.isPending?<Skeleton lines={5}/>:q.isError?<ErrorState message="Não foi possível carregar os indicadores reais." onRetry={()=>void q.refetch()}/>:data&&<>
        <p className="t-label text-ink-mid">Período: {data.range.from} — {data.range.to} · Marcações de hoje são apresentadas separadamente.</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[
          ['Marcações hoje',num(data.metrics.today)],['Atendimentos concluídos',num(data.metrics.completed)],['Ocupação',percent(data.metrics.occupancy)],['Receita estimada',data.metrics.revenue===null?'n/d':formatMT(data.metrics.revenue)],['Variação da receita',percent(data.metrics.revenueChange)],['Taxa de faltas*',percent(data.metrics.noShow)],['Clientes em espera',num(data.metrics.waiting)],['Notificações falhadas',num(data.metrics.failedNotifications)]
        ].map(([label,value])=><Panel key={label}><p className="t-label text-ink-mid break-words">{label}</p><p className="text-xl sm:text-2xl font-medium text-ink-hi break-words mt-2">{value}</p></Panel>)}</div>
        <p className="t-label text-ink-mid">*Faltas ÷ (concluídas + faltas). Receita estimada não é lucro nem pagamento confirmado.</p>
        <Panel title="Prioridades de gestão">
          {data.insights.length===0?<EmptyState title="Sem alertas nestes indicadores" body="Continue a acompanhar a operação. Não significa que todos os riscos estejam cobertos."/>:<div className="space-y-3">{data.insights.map(i=><article key={i.id} className="border border-white/10 rounded-2xl p-4 min-w-0"><p className="t-label text-accent-soft">{i.priority==='high'?'Atenção prioritária':labels[i.category]}</p><h3 className="font-medium text-ink-hi mt-1 break-words">{i.title}</h3><p className="t-body text-ink-mid mt-2 break-words">{i.detail}</p><Link className="inline-flex items-center min-h-11 gap-1 text-accent-soft text-sm mt-2" to={i.href}>Consultar módulo <ArrowUpRight size={15}/></Link></article>)}</div>}
        </Panel>
        <Panel title="Procura indicativa · próximos 7 dias">
          <p className="t-body text-ink-mid mb-4">Média por dia da semana nos últimos 56 dias, apenas dias com capacidade. Intervalo histórico observado; não é uma garantia de procura nem de vagas.</p>
          {data.forecast.length===0?<EmptyState title="Histórico insuficiente" body="A previsão só é apresentada com amostras suficientes."/>:<div className="space-y-3">{data.forecast.map(f=><div key={f.date} className="flex flex-wrap justify-between gap-2 border-b border-white/10 pb-2"><span className="t-body">{f.date}</span><span className="t-body text-ink-hi">{num(f.expected)} marcações</span><span className="t-label text-ink-mid">{f.low}–{f.high} · {f.samples} dias</span></div>)}</div>}
        </Panel>
      </>}
      <OperationalPlan shopId={shopId} userId={userId}/>
      <FinancialIntelligence shopId={shopId} userId={userId}/>
      <p className="t-label text-ink-mid">A inteligência não altera marcações, preços, pagamentos ou contactos. As decisões são tomadas pela equipa.</p>
    </div>
  </Page>
}
export default function IntelligencePage(){
  const {shop,role}=useShop();const {user}=useAuth();
  if(!shop||!user||!['owner','manager'].includes(role??''))return <ErrorState message="Acesso reservado à gestão da barbearia."/>;
  return <Workspace key={user.id+':'+shop.id} userId={user.id} shopId={shop.id}/>;
}
