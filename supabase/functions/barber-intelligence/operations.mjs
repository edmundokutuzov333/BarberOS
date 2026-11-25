import {shift} from './engine.mjs';
const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const round=v=>Math.round(v*10)/10;
const weekday=d=>new Date(d+'T12:00:00Z').getUTCDay();
const labels=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function unique(rows,dates){const map=new Map(),dup=new Set();for(const r of Array.isArray(rows)?rows:[]){if(!r||!dates.has(r.report_date)||!n(r.capacity_minutes)||!n(r.booked_minutes))continue;if(map.has(r.report_date))dup.add(r.report_date);map.set(r.report_date,r)}for(const d of dup)map.delete(d);return map}
export function operationalPlan(history,future,today,setupStep){
 const dates=Array.from({length:7},(_,i)=>shift(today,i+1));
 const past=unique(history,new Set(Array.from({length:56},(_,i)=>shift(today,i-56))));
 const upcoming=unique(future,new Set(dates));
 const profiles=labels.map((label,day)=>{const rows=[...past.values()].filter(r=>weekday(r.report_date)===day&&r.capacity_minutes>0);const capacity=rows.reduce((s,r)=>s+r.capacity_minutes,0);return {label,samples:rows.length,occupancy:rows.length>=4&&capacity>0?round(100*rows.reduce((s,r)=>s+r.booked_minutes,0)/capacity):null}});
 const days=dates.map(date=>{const r=upcoming.get(date),p=profiles[weekday(date)],b={date,weekday:p.label,historicalOccupancy:p.occupancy,samples:p.samples};if(!r)return {...b,capacity:null,booked:null,remaining:null,occupancy:null,signal:'unknown'};const capacity=r.capacity_minutes,booked=r.booked_minutes,occupancy=capacity>0?round(100*booked/capacity):null;return {...b,capacity,booked,remaining:capacity>0?round(Math.max(0,capacity-booked)):null,occupancy,signal:capacity===0?'closed':occupancy>=85?'busy':occupancy<50&&p.occupancy!==null&&p.occupancy<60?'opportunity':'monitor'}});
 const best=days.filter(d=>d.signal==='opportunity').sort((a,b)=>a.occupancy-b.occupancy||a.date.localeCompare(b.date))[0];
 const campaign=best?{title:'Incentivar marcações para '+best.weekday,reason:'Ocupação reservada de '+best.occupancy+'% e histórica de '+best.historicalOccupancy+'% ('+best.samples+' dias comparáveis). Confirme a agenda antes de publicar.',body:'Está na altura de renovar o corte? Consulte os nossos horários de '+best.weekday+' e escolha o momento mais conveniente para si. Faça a sua marcação através da nossa página.'}:null;
 const steps=['Criar barbearia','Perfil','Tema','Serviços','Cortes','Barbeiros','Horários','Regras','Link e QR'];
 const step=Number.isInteger(setupStep)&&setupStep>=0&&setupStep<=9?setupStep:null;
 return {version:1,today,days,campaign,setup:step===null?null:{step,total:9,complete:step===9,next:step===9?null:steps[step]}};
}
const drafts={
 confirmation:{subject:'Confirmação de marcação',body:'Olá! Obrigado pela sua preferência. Gostaríamos de confirmar os detalhes da sua marcação. Por favor, consulte a confirmação enviada pela barbearia ou entre em contacto connosco se precisar de alguma alteração.'},
 reschedule:{subject:'Reagendamento de marcação',body:'Olá! Gostaríamos de ajudar a encontrar outro horário para o seu atendimento. Indique-nos a sua disponibilidade, para podermos verificar as opções na agenda. Obrigado pela compreensão.'},
 acknowledgement:{subject:'Recebemos a sua mensagem',body:'Olá! Obrigado pela sua mensagem. Vamos verificar a situação e responder com a informação necessária. Agradecemos a sua compreensão.'},
 feedback:{subject:'Obrigado pelo seu feedback',body:'Olá! Agradecemos o tempo que dedicou a partilhar a sua experiência. O seu feedback ajuda-nos a melhorar. Vamos analisar os pontos apresentados com atenção.'},
 return:{subject:'Volte a visitar-nos',body:'Olá! Esperamos que esteja bem. Se estiver na altura de renovar o corte, estamos à disposição para ajudar a encontrar um horário conveniente. Será um prazer voltar a recebê-lo.'},
 information:{subject:'Informações sobre a barbearia',body:'Olá! Obrigado pelo interesse nos nossos serviços. Indique-nos, por favor, quais as informações de que necessita, para podermos ajudar da melhor forma.'}
};
export const draftKinds=Object.keys(drafts);
export function prepareDraft(kind){if(!Object.hasOwn(drafts,kind))throw new Error('INVALID_DRAFT_KIND');return {version:1,kind,...drafts[kind]}}
