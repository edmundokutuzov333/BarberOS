// Finance intelligence: all monetary values are integer minor units, never inferred cash or profit.
const money=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const signed=v=>Number.isSafeInteger(v)?v:null;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const round=v=>Math.round(v*10)/10;
const ratio=(a,b)=>a!==null&&b!==null&&b>0?round(a/b*100):null;
const diff=(a,b)=>a!==null&&b!==null&&b>0?round((a-b)/b*100):null;
const sum=(rows,key)=>{let n=0;for(const r of rows){const v=money(r[key]);if(v===null||!Number.isSafeInteger(n+v))return null;n+=v}return n};
function unique(rows,key){if(!Array.isArray(rows))throw Error('INVALID_REPORT');const seen=new Set();for(const r of rows){if(!r||typeof r[key]!=='string'||seen.has(r[key]))throw Error('INVALID_REPORT');seen.add(r[key])}return rows}
export function financialIntelligence(current,previous,services,barbers,staff,store,range){
 const revenue=money(current.estimated_revenue_cents),old=money(previous.estimated_revenue_cents),completed=money(current.completed_count),prevCompleted=money(previous.completed_count);
 const ticket=completed!==null&&completed>0&&revenue!==null?Math.round(revenue/completed):null;
 const oldTicket=prevCompleted!==null&&prevCompleted>0&&old!==null?Math.round(old/prevCompleted):null;
 const capacity=finite(current.capacity_minutes),booked=finite(current.booked_minutes);
 const staffRows=staff&&Array.isArray(staff.summary)?unique(staff.summary,'barber_id'):null;
 const staffTotal=staffRows?sum(staffRows,'completed_count'):null;
 const unknown=staffRows?sum(staffRows,'unknown_count'):null;
 const commission=staffRows?sum(staffRows,'commission_minor'):null;
 const tips=staffRows?sum(staffRows,'tip_minor'):null;
 const reconciled=staffRows!==null&&staffRows.every(r=>money(r.unknown_count)!==null&&money(r.completed_count)!==null&&r.unknown_count<=r.completed_count)&&completed!==null&&staffTotal===completed&&money(staff.total)===completed&&unknown!==null&&unknown<=completed&&commission!==null&&tips!==null&&revenue!==null&&commission<=revenue;
 const fullyKnown=reconciled&&unknown===0;
 const staffMap=new Map((staffRows??[]).map(r=>[r.barber_id,r]));
 const team=unique(barbers,'barber_id').map(r=>{
   const count=money(r.completed_count),earned=money(r.estimated_revenue_cents),cap=finite(r.capacity_minutes),used=finite(r.booked_minutes),s=staffMap.get(r.barber_id);
   const known=reconciled&&s&&money(s.completed_count)===count&&money(s.unknown_count)===0&&money(s.commission_minor)!==null&&earned!==null&&s.commission_minor<=earned;
   return {id:r.barber_id,name:String(r.barber_name??'Barbeiro').slice(0,120),completed:count,revenue:earned,capacity:cap,occupancy:ratio(used,cap),commission:known?s.commission_minor:null,afterCommission:known?earned-s.commission_minor:null};
 });
 const svc=unique(services,'service_id').map(r=>{const count=money(r.completed_count),earned=money(r.estimated_revenue_cents);return {id:r.service_id,name:String(r.service_name??'Serviço').slice(0,120),completed:count,revenue:earned,share:ratio(earned,revenue),ticket:count!==null&&count>0&&earned!==null?Math.round(earned/count):null}}).filter(r=>r.completed!==null&&r.completed>0).sort((a,b)=>(b.revenue??-1)-(a.revenue??-1)||a.id.localeCompare(b.id));
 const serviceConsistent=revenue!==null&&completed!==null&&sum(svc,'revenue')===revenue&&sum(svc,'completed')===completed;
 const knownUnits=store?money(store.delivered_cost_known_units):null,unknownUnits=store?money(store.delivered_cost_unknown_units):null;
 const gross=store?signed(store.delivered_known_gross_margin_minor):null,cost=store?money(store.delivered_known_cost_minor):null;
 const shop=store?{knownUnits,unknownUnits,knownCost:cost,knownGrossMargin:gross,complete:knownUnits!==null&&knownUnits>0&&unknownUnits===0&&gross!==null&&cost!==null}:null;
 const insights=[];
 if(reconciled&&unknown>0)insights.push({id:'missing-commission',text:unknown+' atendimentos sem comissão histórica conhecida. Complete a configuração para atendimentos futuros; não estime retroactivamente.'});
 if(!reconciled)insights.push({id:'unreconciled',text:'Comissões indisponíveis ou totais divergentes. Não foi calculado o valor após comissões.'});
 if(serviceConsistent&&svc.length&&svc[0].share!==null&&svc[0].share>=60&&completed>=10)insights.push({id:'concentration',text:'Um serviço representa '+svc[0].share+'% da receita estimada. Avalie a concentração antes de mudar o catálogo.'});
 if(shop&&unknownUnits>0)insights.push({id:'missing-cost',text:unknownUnits+' unidades entregues sem custo histórico conhecido. A margem apresentada cobre apenas as unidades com custo registado.'});
 if(capacity>0&&booked!==null&&booked/capacity<0.5&&completed>0)insights.push({id:'capacity',text:'Menos de metade da capacidade foi reservada. Reveja a agenda antes de ampliar horários.'});
 return {version:1,from:range.from,to:range.to,previousFrom:range.previousFrom,previousTo:range.previousTo,revenue,previousRevenue:old,revenueChange:diff(revenue,old),completed,completedChange:diff(completed,prevCompleted),ticket,ticketChange:diff(ticket,oldTicket),occupancy:ratio(booked,capacity),commissionKnown:reconciled?commission:null,commissionUnknown:reconciled?unknown:null,tips:reconciled?tips:null,afterCommission:fullyKnown?revenue-commission:null,serviceConsistent,services:serviceConsistent?svc.slice(0,20):[],team:team.slice(0,30),store:shop,insights};
}
