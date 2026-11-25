// Customer intelligence: deterministic, bounded, read-only. Never calls an AI provider.
const dateKey=(value,timezone)=>{
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const get=t=>parts.find(p=>p.type===t)?.value;
  return get('year')+'-'+get('month')+'-'+get('day');
};
const dayNumber=day=>Date.parse(day+'T00:00:00Z')/86400000;
const median=values=>{const s=[...values].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
const shift=(day,n)=>new Date((dayNumber(day)+n)*86400000).toISOString().slice(0,10);
function frequent(rows,field){
  const counts=new Map();
  for(const row of rows){const v=row[field];if(typeof v==='string'&&v.trim())counts.set(v,(counts.get(v)??0)+1)}
  const sorted=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt'));
  return sorted.length&&sorted[0][1]>=2&&(!sorted[1]||sorted[0][1]>sorted[1][1])?{label:sorted[0][0].slice(0,120),count:sorted[0][1]}:null;
}
export function customerIntelligence(customer,history,now,timezone){
  const today=dateKey(now.toISOString(),timezone);
  if(!today||!Array.isArray(history)||!customer||typeof customer!=='object')throw new Error('INVALID_CUSTOMER_HISTORY');
  const unique=new Map();
  for(const row of history){if(typeof row.appointment_id==='string'&&!unique.has(row.appointment_id)&&typeof row.starts_at==='string'&&Number.isFinite(Date.parse(row.starts_at)))unique.set(row.appointment_id,row)}
  const past=[...unique.values()].filter(row=>Date.parse(row.starts_at)<=now.getTime());
  const completed=past.filter(row=>row.status==='completed').sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at));
  const visitDays=[...new Set(completed.map(row=>dateKey(row.starts_at,timezone)).filter(Boolean))].sort();
  const gaps=visitDays.slice(1).map((day,i)=>dayNumber(day)-dayNumber(visitDays[i])).filter(n=>n>0);
  const recentGaps=gaps.slice(-8);
  const cycle=recentGaps.length>=3?Math.max(1,Math.round(median(recentGaps))):null;
  const lastVisit=visitDays.at(-1)??null;
  const elapsed=lastVisit===null?null:Math.max(0,dayNumber(today)-dayNumber(lastVisit));
  const futureStates=['pending','confirmed','in_progress'];
  const future=typeof customer.next_appointment_at==='string'&&Number.isFinite(Date.parse(customer.next_appointment_at))&&Date.parse(customer.next_appointment_at)>=now.getTime();
  const hasUpcoming=future||[...unique.values()].some(row=>futureStates.includes(row.status)&&(Date.parse(row.starts_at)>=now.getTime()||row.status==='in_progress'));
  const nextVisit=cycle!==null&&lastVisit?shift(lastVisit,cycle):null;
  const returnStatus=hasUpcoming?'scheduled':cycle===null||elapsed===null?'insufficient':elapsed>=Math.max(cycle+7,Math.ceil(cycle*1.5))?'overdue':elapsed>=cycle?'due':'regular';
  const missed=past.filter(row=>row.status==='no_show').length;
  const resolved=completed.length+missed;
  const noShowRate=resolved>=5?Math.round(1000*missed/resolved)/10:null;
  const risk=resolved<5?'insufficient':missed>=2&&noShowRate>=20?'review':'normal';
  const drafts={overdue:'Olá! Esperamos que esteja bem. Já passou algum tempo desde a sua última visita. Se quiser marcar um novo atendimento, estamos à disposição.',due:'Olá! Tudo bem? Se estiver na altura de renovar o corte, podemos ajudar a encontrar um horário conveniente para si.'};
  return {version:1,today,historyCount:unique.size,completed:completed.length,missed,resolved,cycleDays:cycle,cycleSamples:recentGaps.length,lastVisit,daysSinceVisit:elapsed,indicativeReturnDate:nextVisit,returnStatus,hasUpcoming,noShowRate,risk,frequentService:frequent(completed,'service_name'),frequentHaircut:frequent(completed,'haircut_name'),lastService:typeof completed[0]?.service_name==='string'?completed[0].service_name.slice(0,120):null,draft:hasUpcoming?null:drafts[returnStatus]??null};
}
