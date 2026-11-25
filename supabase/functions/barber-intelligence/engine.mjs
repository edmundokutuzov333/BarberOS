// Pure deterministic management intelligence. No external calls or customer PII.
export const topics = ['overview','agenda','finance','customers','team','stock','communications','marketing','setup'];
export const topicLabels = {overview:'Visão geral',agenda:'Agenda e procura',finance:'Receitas',customers:'Clientes',team:'Equipa',stock:'Loja e stock',communications:'Comunicações',marketing:'Marketing',setup:'Configuração'};
export function topicFor(question) {
  const q=question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const rules=[['stock',/\b(stock|inventario|produto[s]?|loja|reposicao)\b/],['finance',/\b(receita[s]?|factur\w*|fatur\w*|lucro[s]?|dinheiro|finance\w*|margem|comiss\w*|ticket)\b/],['customers',/\b(cliente[s]?|retorno|recuper\w*|fidel\w*)\b/],['team',/\b(equipa|barbeiro[s]?|desempenho)\b/],['communications',/\b(notific\w*|email[s]?|gmail|mensage\w*|whatsapp)\b/],['marketing',/\b(marketing|campanha[s]?|promoc\w*|instagram)\b/],['setup',/\b(configur\w*|onboarding|definic\w*)\b/],['agenda',/\b(agenda|marc\w*|vaga[s]?|falta[s]?|ocupac\w*|procura|horario[s]?)\b/],['overview',/\b(resumo|negocio|briefing|geral|hoje|semana|mes)\b/]];
  return rules.find(([,pattern])=>pattern.test(q))?.[0] ?? null;
}
const number=(v)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const count=(v)=>number(v)!==null&&Number.isSafeInteger(v)&&v>=0?v:null;
const money=(v)=>number(v)!==null&&Number.isSafeInteger(v)&&v>=0?v:null;
const round=(v)=>Math.round(v*10)/10;
const fmt=(v)=>v===null?'n/d':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(v);
const mt=(v)=>v===null?'n/d':new Intl.NumberFormat('pt-PT',{style:'currency',currency:'MZN'}).format(v/100);
const pct=(v)=>v===null?'n/d':fmt(v)+'%';
export function shift(day,delta){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
export function ranges(now,timezone,days){
  if(![7,30].includes(days))throw new Error('INVALID_PERIOD');
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=t=>p.find(x=>x.type===t)?.value;
  const today=part('year')+'-'+part('month')+'-'+part('day');
  return {today,from:shift(today,-days),to:shift(today,-1),previousFrom:shift(today,-2*days),previousTo:shift(today,-days-1),historyFrom:shift(today,-56)};
}
export function forecast(rows,today){
  if(!Array.isArray(rows))return [];
  const expected=new Set(Array.from({length:56},(_,i)=>shift(today,-56+i)));
  const valid=rows.filter(r=>expected.has(r.report_date)&&count(r.appointment_count)!==null&&number(r.capacity_minutes)>0);
  if(new Set(valid.map(r=>r.report_date)).size!==valid.length||valid.reduce((s,r)=>s+r.appointment_count,0)<20)return [];
  const weekday=d=>new Date(d+'T12:00:00Z').getUTCDay();
  return Array.from({length:7},(_,i)=>shift(today,i+1)).flatMap(date=>{
    const sample=valid.filter(r=>weekday(r.report_date)===weekday(date)).map(r=>r.appointment_count);
    if(sample.length<4)return [];
    const mean=sample.reduce((a,b)=>a+b,0)/sample.length;
    return [{date,expected:round(mean),low:Math.min(...sample),high:Math.max(...sample),samples:sample.length}];
  });
}
export function analyze(input,range,topic) {
  const {current:c,previous:p,dashboard:d,crm,wait,notifications,store,services,barbers,history}=input;
  const completed=count(c.completed_count), missed=count(c.no_show_count), appointments=count(c.appointment_count);
  const noShow=completed!==null&&missed!==null&&completed+missed>0?round(100*missed/(completed+missed)):null;
  const revenue=money(c.estimated_revenue_cents),old=money(p.estimated_revenue_cents);
  const change=revenue!==null&&old!==null&&old>0?round(100*(revenue-old)/old):null;
  const occupancy=number(c.occupancy_percent), today=count(d.today);
  const metrics={today,appointments,completed,noShow,occupancy,revenue,revenueChange:change,waiting:count(wait.waiting_count),failedNotifications:count(notifications.failed_count),customers:count(crm.total_customers),recentCustomers:count(crm.customers_visited_last_30d),lowStock:count(store?.low_stock_variants)};
  const insights=[];
  const add=(id,category,title,detail,href,priority='normal')=>insights.push({id,category,title,detail,href,priority});
  if(appointments===0)add('empty','overview','Ainda sem marcações neste período','Partilhe a página da barbearia e verifique se os horários e serviços estão publicados.','/app/agenda');
  if(occupancy!==null&&number(c.capacity_minutes)>0&&occupancy<50)add('capacity','agenda','Capacidade por aproveitar',pct(occupancy)+' de ocupação no período. Reveja horários pouco utilizados antes de reforçar a equipa.','/app/agenda');
  if(occupancy!==null&&occupancy>=85)add('busy','agenda','Agenda com ocupação elevada',pct(occupancy)+' no período. Verifique a capacidade e a lista de espera antes de alterar horários.','/app/horarios');
  if(noShow!==null&&completed+missed>=10&&noShow>=10)add('noshow','agenda','Reveja as faltas',pct(noShow)+' entre atendimentos concluídos e faltas. Confirme os lembretes; não cancele reservas com base neste indicador.','/app/marcacoes','high');
  if(metrics.waiting>0)add('wait','agenda','Clientes em espera',fmt(metrics.waiting)+' pedidos em espera. Consulte as vagas e preserve a ordem do motor de lista de espera.','/app/lista-espera');
  if(change!==null&&change<0)add('revenue','finance','Receita estimada em queda',pct(change)+' face ao período anterior de igual duração. Compare serviços e volume; receita não é lucro.','/app/relatorios','high');
  if(change!==null&&change>=10)add('growth','finance','Receita estimada em crescimento','+'+pct(change)+' face ao período anterior. Confirme custos e margem antes de interpretar como lucro.','/app/relatorios');
  if(metrics.customers>0&&metrics.recentCustomers!==null&&metrics.customers-metrics.recentCustomers>0)add('return','customers','Reveja a base de clientes',fmt(metrics.customers-metrics.recentCustomers)+' clientes não registaram visita nos últimos 30 dias. Este grupo inclui clientes novos e não representa abandono confirmado. Consulte o histórico e o consentimento antes de contactar.','/app/clientes');
  if(metrics.lowStock>0)add('stock','stock','Produtos com stock baixo',fmt(metrics.lowStock)+' variantes sinalizadas. Confirme as quantidades físicas antes de repor.','/app/loja/produtos','high');
  if(metrics.failedNotifications>0)add('notify','communications','Notificações por resolver',fmt(metrics.failedNotifications)+' notificações falhadas. Verifique os erros e utilize o reenvio autorizado.','/app/notificacoes','high');
  const ranked=Array.isArray(services)?services.filter(x=>typeof x.service_name==='string'&&count(x.completed_count)>0).sort((a,b)=>b.completed_count-a.completed_count):[];
  if(ranked.length)add('service','finance','Serviço com mais atendimentos concluídos',ranked[0].service_name.slice(0,120)+': '+fmt(ranked[0].completed_count)+' atendimentos. Volume não equivale a margem.','/app/relatorios');
  const team=Array.isArray(barbers)?barbers.filter(x=>typeof x.barber_name==='string'&&number(x.occupancy_percent)!==null&&number(x.capacity_minutes)>0):[];
  if(team.length>=2){const sorted=[...team].sort((a,b)=>a.occupancy_percent-b.occupancy_percent);const gap=round(sorted.at(-1).occupancy_percent-sorted[0].occupancy_percent);if(gap>=25)add('team','team','Distribuição desigual de ocupação',fmt(gap)+' pontos percentuais de diferença entre extremos. Compare tipos de serviço e horários antes de redistribuir trabalho.','/app/relatorios')}
  if(occupancy!==null&&number(c.capacity_minutes)>0&&occupancy<50&&appointments>0)add('campaign','marketing','Experimente preencher horários tranquilos','Prepare uma oferta para períodos de menor ocupação, sem alterar preços nem contactar clientes automaticamente.','/app/agenda');
  if(d.hasBarbers===false)add('setup','setup','Configure a equipa','Adicione pelo menos um barbeiro e confirme os horários e serviços disponíveis.','/app/barbeiros','high');
  const advice=({overview:'Consulte as prioridades abaixo. Os indicadores são calculados sobre dados reais, não por um modelo de linguagem.',agenda:'Ocupação: '+pct(occupancy)+'. Faltas entre concluídas e faltas: '+pct(noShow)+'. A disponibilidade real continua a ser validada pelo motor de agenda.',finance:'Receita estimada: '+mt(revenue)+'. Variação: '+pct(change)+'. Não representa lucro nem confirmação de pagamento.',customers:'Base de clientes: '+fmt(metrics.customers)+'. Visitaram nos últimos 30 dias: '+fmt(metrics.recentCustomers)+'.',team:'Compare capacidade, ocupação e serviços antes de avaliar a equipa. Não existe ranking automático de funcionários.',stock:store?'Variantes com stock baixo: '+fmt(metrics.lowStock)+'. Confirme fisicamente antes de comprar.':'Relatório de loja indisponível ou loja não activa.',communications:'Notificações falhadas: '+fmt(metrics.failedNotifications)+'. O assistente não envia mensagens.',marketing:'Utilize os horários de menor ocupação para preparar uma campanha. Respeite o consentimento e confirme preços.',setup:'Confirme equipa, horários, serviços, perfil público e preferências de notificação.'})[topic];
  return {version:1,range,topic,metrics,insights:insights.sort((a,b)=>Number(b.priority==='high')-Number(a.priority==='high')),forecast:forecast(history,range.today),answer:advice,cloud:null};
}
