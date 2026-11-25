import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, BrainCircuit, RefreshCw, CalendarDays, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Users, Target, Coins, ArrowUpRight, BarChart3, CalendarCheck, type LucideIcon } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { useShop } from '@/lib/shop';
import { useAuth } from '@/lib/auth';
import { formatMT } from '@/lib/utils';
import { loadIntelligence, labels, type Topic, type Intelligence } from '@/features/intelligence/api';
import IntelligenceHub from '@/features/intelligence/IntelligenceHub';
import VoiceQuestion from '@/features/intelligence/VoiceQuestion';
import FinancialIntelligence from '@/features/intelligence/FinancialIntelligence';
import OperationalPlan from '@/features/intelligence/OperationalPlan';
import '@/features/intelligence/intelligence.css';

const mainTopics:Topic[]=['overview','agenda','finance','customers','team','stock','communications','marketing'];
const quick: {label:string; question:string; topic:Topic; icon:LucideIcon}[]=[
 {label:'Como posso aumentar a ocupação da agenda?',question:'Como posso aumentar a ocupação da agenda?',topic:'agenda',icon:TrendingUp},
 {label:'Que dias são melhores para campanhas?',question:'Que dias da próxima semana são melhores para campanhas?',topic:'marketing',icon:CalendarDays},
 {label:'Como posso melhorar a fidelização de clientes?',question:'Como posso melhorar a fidelização de clientes?',topic:'customers',icon:Users}
];
const fmt=(v:number|null)=>v===null?'—':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(v);
const pct=(v:number|null)=>v===null?'—':fmt(v)+'%';
type Turn={question:string;answer:string;advice:string|null;topic:Topic;cloud: Intelligence['cloud']['status']};
function Metric({label,value,icon:Icon,delta,caption}:{label:string;value:string;icon:LucideIcon;delta?:number|null;caption:string}){
 return <article className="bi-metric">
  <span className="bi-metric-icon"><Icon size={23} aria-hidden="true"/></span>
  <div className="bi-metric-content"><p>{label}</p><strong>{value}</strong><span className="bi-metric-caption">{caption}</span></div>
  {delta!==null&&delta!==undefined&&<span className={'bi-delta '+(delta<0?'bi-delta-down':delta>0?'bi-delta-up':'')} title="Variação face ao período anterior equivalente">{delta>0?<TrendingUp size={13}/>:delta<0?<TrendingDown size={13}/>:null}{delta>0?'+':''}{fmt(delta)}%</span>}
 </article>
}
function Workspace({shopId,userId}:{shopId:string;userId:string}){
 const [days,setDays]=useState<7|30>(30);
 const [topic,setTopic]=useState<Topic>('overview');
 const [question,setQuestion]=useState('');
 const [voiceBusy,setVoiceBusy]=useState(false);
 const [history,setHistory]=useState<Turn[]>([]);
 const [expanded,setExpanded]=useState(false);
 const input=useRef<HTMLTextAreaElement>(null);
 const turns=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(turns.current)turns.current.scrollTop=turns.current.scrollHeight},[history]);
 const contextTopic=history.at(-1)?.topic;
 // The overview always uses the selected period; choosing a topic does not spend a cloud request.
 const q=useQuery({queryKey:['intelligence',userId,shopId,days,'overview'],queryFn:()=>loadIntelligence(shopId,days,'overview'),staleTime:60_000,retry:false});
 const ask=useMutation({mutationFn:(request:{question?:string;topic:Topic;context?:Topic;cloud:boolean})=>loadIntelligence(shopId,days,request.topic,request.question,request.cloud,request.context),retry:false,onSuccess:(response,request)=>{
  setHistory(h=>[...h,{question:request.question||labels[request.topic],answer:response.answer,advice:response.cloud.advice,topic:response.topic,cloud:response.cloud.status}].slice(-12));
  setQuestion('');setTopic(response.topic);
 }});
 const data=q.data;
 const busy=ask.isPending||voiceBusy;
 const reset=()=>{ask.reset();setHistory([]);setQuestion('')};
 const selectTopic=(next:Topic,focus=false)=>{if(busy)return;reset();setTopic(next);if(focus)input.current?.focus({preventScroll:true})};
 const submit=()=>{if(busy||!data)return;ask.mutate({question:question.trim()||undefined,topic,context:contextTopic,cloud:data.cloud.status!=='disabled'})};
 const chooseQuick=(item:typeof quick[number])=>{if(busy)return;reset();setTopic(item.topic);setQuestion(item.question);input.current?.focus()};
 return <Page testId="intelligence-page" className="bi-page" title="Inteligência de gestão" subtitle="IA especializada na gestão da sua barbearia. Análises, previsões e recomendações com dados reais." actions={<div className="bi-toolbar">
  <label className="bi-period"><CalendarDays size={17} aria-hidden="true"/><span className="sr-only">Período de análise</span><select value={days} disabled={busy} onChange={e=>{reset();setDays(Number(e.target.value)===7?7:30)}}><option value={30}>Últimos 30 dias</option><option value={7}>Últimos 7 dias</option></select><ChevronDown size={15} aria-hidden="true"/></label>
  <button className="bi-outline" type="button" disabled={busy||q.isFetching} onClick={()=>void q.refetch()}><RefreshCw size={17} className={q.isFetching?'bi-spin':undefined} aria-hidden="true"/>Actualizar</button>
 </div>}>
 <div className="bi-workspace">
  <section className="bi-hero" aria-label="Centro de inteligência">
   <IntelligenceHub topic={topic} disabled={busy} onSelect={t=>selectTopic(t,true)}/>
   <section className="bi-assistant" aria-labelledby="bi-assistant-title">
    <div className="bi-assistant-heading"><span className="bi-assistant-icon"><BrainCircuit size={25} aria-hidden="true"/></span><div><h2 id="bi-assistant-title">Assistente de gestão</h2><p>Pergunte, analise e receba recomendações práticas para melhorar o desempenho da sua barbearia.</p></div></div>
    <div className="bi-topics" aria-label="Temas de gestão">{[mainTopics.slice(0,4),mainTopics.slice(4)].map((row,i)=><div className="bi-topic-row" key={i}>{row.map(t=><button key={t} type="button" aria-pressed={topic===t} disabled={busy} onClick={()=>selectTopic(t)}>{labels[t]}</button>)}</div>)}</div>
    <form className="bi-form" onSubmit={e=>{e.preventDefault();submit()}}>
     <label className="sr-only" htmlFor="intelligence-question">Pergunta (não inclua dados pessoais)</label>
     <div className="bi-input"><textarea ref={input} id="intelligence-question" rows={2} maxLength={300} value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)} placeholder="Faça uma pergunta sobre a sua barbearia..." onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit()}}}/>{data&&data.cloud.status!=='disabled'&&<VoiceQuestion compact shopId={shopId} disabled={ask.isPending||Boolean(question.trim())} onText={setQuestion} onBusy={setVoiceBusy}/>}</div>
     <button type="submit" className="bi-submit" disabled={busy||!data} aria-busy={ask.isPending}><Sparkles size={19} aria-hidden="true"/>{ask.isPending?'A consultar…':'Consultar IA'}</button>
    </form>
    {ask.isError&&<div role="alert" className="bi-message">Não foi possível concluir a consulta. <button type="button" className="bi-text-button" disabled={busy} onClick={()=>submit()}>Tentar novamente</button></div>}
    {q.isError&&<div role="alert" className="bi-message">Não foi possível carregar os indicadores. <button className="bi-text-button" type="button" onClick={()=>void q.refetch()}>Actualizar</button></div>}
    {data?.cloud.status==='disabled'&&<p className="bi-message">Modo de análise própria activo.</p>}
    {history.length>0&&<section className="bi-conversation" aria-label="Conversa">
     <div className="bi-conversation-header"><h3>Conversa</h3><button type="button" className="bi-text-button" onClick={()=>{reset();input.current?.focus()}} disabled={busy}>Nova conversa</button></div>
     <div ref={turns} className="bi-turns" aria-live="polite" aria-relevant="additions text" role="log">{history.map((turn,i)=><article className="bi-turn" key={i}><p className="bi-question">{turn.question}</p><p className="bi-answer">{turn.answer}</p>{turn.advice&&<><span className="bi-advice-label">Recomendações</span><p className="bi-answer">{turn.advice}</p></>}{['quota','unavailable'].includes(turn.cloud)&&<p className="bi-message">IA externa indisponível. Análise própria apresentada.</p>}</article>)}</div>
    </section>}
    <div className="bi-quick"><h3>Sugestões rápidas</h3>{quick.map(item=><button key={item.label} type="button" disabled={busy} onClick={()=>chooseQuick(item)}><item.icon size={20} aria-hidden="true"/><span>{item.label}</span><ChevronRight size={16} aria-hidden="true"/></button>)}</div>
    
   </section>
  </section>
  <section aria-label="Indicadores essenciais" className="bi-kpis" data-testid="intelligence-kpis">
   {q.isPending?<div className="bi-kpi-loading"><Skeleton lines={2}/></div>:data&&!q.isError?<>
    <Metric label="Marcações hoje" value={fmt(data.metrics.today)} icon={CalendarCheck} caption="Hoje"/>
    <Metric label="Atendimentos concluídos" value={fmt(data.metrics.completed)} icon={Users} caption={days+' dias completos'}/>
    <Metric label="Ocupação" value={pct(data.metrics.occupancy)} icon={Target} caption={days+' dias completos'}/>
    <Metric label="Receita estimada" value={data.metrics.revenue===null?'—':formatMT(data.metrics.revenue)} icon={Coins} delta={data.metrics.revenueChange} caption="Não é lucro"/>
   </>:<p className="bi-message">Indicadores indisponíveis. Actualize para consultar os dados reais.</p>}
  </section>
  {data&&!q.isError&&<div className="bi-detail">
   <button type="button" className="bi-detail-toggle" aria-expanded={expanded} aria-controls={expanded?"bi-detail-content":undefined} onClick={()=>setExpanded(v=>!v)}><BarChart3 size={19} aria-hidden="true"/><span>Análises e prioridades</span>{data.insights.some(i=>i.priority==='high')&&<small>{data.insights.filter(i=>i.priority==='high').length} prioritárias</small>}<ChevronDown size={18} className={expanded?'bi-rotated':undefined}/></button>
   {expanded&&<div id="bi-detail-content" className="bi-detail-content"><p className="bi-message">Período: {data.range.from} — {data.range.to}. Comparação com igual período anterior; marcações de hoje em separado.</p>
    <div className="bi-secondary-metrics">{[['Taxa de faltas',pct(data.metrics.noShow)],['Clientes em espera',fmt(data.metrics.waiting)],['Notificações falhadas',fmt(data.metrics.failedNotifications)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <section className="bi-priorities"><h3>Prioridades de gestão</h3>{data.insights.length===0?<p className="bi-message">Sem alertas nestes indicadores.</p>:data.insights.map(i=><article key={i.id}><div><strong>{i.title}</strong><p>{i.detail}</p></div><Link to={i.href} className="bi-text-button">Consultar módulo <ArrowUpRight size={15}/></Link></article>)}</section>
    <section className="bi-priorities"><h3>Procura indicativa · próximos 7 dias</h3><p className="bi-message">Média histórica, não garantia de vagas.</p>{data.forecast.length?data.forecast.map(f=><div className="bi-forecast" key={f.date}><span>{f.date}</span><strong>{fmt(f.expected)} marcações</strong><small>{f.low}–{f.high} · {f.samples} dias</small></div>):<p className="bi-message">Histórico insuficiente para estimar procura.</p>}</section>
    <OperationalPlan shopId={shopId} userId={userId}/><FinancialIntelligence shopId={shopId} userId={userId}/>
   </div>}
  </div>}
  <details className="bi-privacy"><summary>Privacidade e funcionamento</summary><p>Não inclua dados pessoais nas perguntas. A Groq recebe apenas tema, intenção e sinais qualitativos. O áudio é enviado apenas com confirmação. A IA não altera marcações, preços, pagamentos ou contactos.</p></details>
 </div>
 </Page>
}
export default function IntelligencePage(){
 const {shop,role}=useShop();const {user}=useAuth();
 if(!shop||!user||!['owner','manager'].includes(role??''))return <ErrorState message="Acesso reservado à gestão da barbearia."/>;
 return <Workspace key={user.id+':'+shop.id} shopId={shop.id} userId={user.id}/>;
}
