// Bounded, read-only server analytics. Sales are gross recorded stock exits, not net profit or guaranteed future demand.
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const round=v=>Math.round(v*10)/10;
const DAY=86400000;
export function inventoryIntelligence(products,variants,movements,now){
 const end=now.getTime(),start=end-30*DAY;
 const tracked=new Map(products.filter(p=>p.track_stock===true&&p.is_active===true).map(p=>[p.id,p]));
 const sales=new Map(),seen=new Set();
 for(const m of movements){const at=Date.parse(m.created_at);if(m.reason!=='sale'||!Number.isSafeInteger(m.delta_qty)||m.delta_qty>=0||!Number.isFinite(at)||at<start||at>=end||seen.has(m.id))continue;seen.add(m.id);const current=sales.get(m.variant_id)??{units:0,days:new Set()};current.units-=m.delta_qty;current.days.add(new Date(at).toISOString().slice(0,10));sales.set(m.variant_id,current)}
 const rows=variants.filter(v=>v.is_active===true&&tracked.has(v.product_id)&&integer(v.stock_on_hand)&&integer(v.low_stock_threshold)).map(v=>{
   const p=tracked.get(v.product_id),s=sales.get(v.id)??{units:0,days:new Set()};
   const oldEnough=Number.isFinite(Date.parse(v.created_at))&&Date.parse(v.created_at)<=start&&Number.isFinite(Date.parse(p.created_at))&&Date.parse(p.created_at)<=start;
   const rate=oldEnough&&s.days.size>=3&&s.units>=5?s.units/30:null;
   const cover=rate===null?null:round(v.stock_on_hand/rate);
   const target=rate===null?null:Math.max(v.low_stock_threshold+1,Math.ceil(rate*14));
   const suggested=target===null?null:Math.max(0,target-v.stock_on_hand);
   const signal=v.stock_on_hand===0?'out':v.stock_on_hand<=v.low_stock_threshold?'low':cover!==null&&cover<=7?'watch':'ok';
   return {id:v.id,product:String(p.name).slice(0,160),variant:String(v.label).slice(0,120),stock:v.stock_on_hand,threshold:v.low_stock_threshold,sold:s.units,saleDays:s.days.size,dailyRate:rate===null?null:round(rate),coverDays:cover,suggestedUnits:suggested,signal};
 });
 const priority={out:0,low:1,watch:2,ok:3};
 rows.sort((a,b)=>priority[a.signal]-priority[b.signal]||a.product.localeCompare(b.product,'pt')||a.variant.localeCompare(b.variant,'pt')||a.id.localeCompare(b.id));
 return {version:1,asOf:now.toISOString(),windowDays:30,trackedCount:rows.length,alertCount:rows.filter(r=>r.signal!=='ok').length,estimatedCount:rows.filter(r=>r.coverDays!==null).length,rows:rows.slice(0,50)};
}
const rules=[
 ['waiting','Tempo de espera',/\b(espera|esperei|atraso|atrasado|atrasada|demora|demorou|demorado|pontual|pontualidade)\b/],
 ['service','Corte e resultado',/\b(corte|cortes|barba|acabamento|resultado|degrade|fade|penteado)\b/],
 ['care','Atendimento',/\b(atendimento|atencioso|atenciosa|simpatia|simpatica|simpatico|educado|educada|profissional|profissionalismo|respeito)\b/],
 ['cleanliness','Higiene e espaço',/\b(limpeza|limpo|limpa|sujo|suja|higiene|ambiente|espaco|conforto)\b/],
 ['price','Preço e valor',/\b(preco|precos|caro|cara|barato|barata|valor|pagamento)\b/],
 ['booking','Marcação',/\b(marcacao|marcacoes|reserva|reservas|agenda|horario|horarios|reagendar)\b/]
];
export function reviewIntelligence(rows){
 const valid=[],seen=new Set();
 for(const r of rows){if(!r||typeof r.review_id!=='string'||seen.has(r.review_id)||!Number.isInteger(r.rating)||r.rating<1||r.rating>5)continue;seen.add(r.review_id);valid.push(r)}
 const stars=[1,2,3,4,5].map(rating=>({rating,count:valid.filter(r=>r.rating===rating).length}));
 const negative=valid.filter(r=>r.rating<=2).length,neutral=valid.filter(r=>r.rating===3).length,positive=valid.filter(r=>r.rating>=4).length;
 const comments=valid.filter(r=>typeof r.comment==='string'&&r.comment.trim());
 const topics=rules.map(([id,label,re])=>{let mentions=0,lowRated=0;for(const r of comments){const s=r.comment.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(re.test(s)){mentions++;if(r.rating<=2)lowRated++}}return {id,label,mentions,lowRated}}).filter(t=>t.mentions>0).sort((a,b)=>b.lowRated-a.lowRated||b.mentions-a.mentions||a.id.localeCompare(b.id));
 return {version:1,sampleCount:valid.length,commentCount:comments.length,average:valid.length?round(valid.reduce((s,r)=>s+r.rating,0)/valid.length):null,negative,neutral,positive,stars,topics,reply:negative>0?'Olá! Obrigado por partilhar a sua experiência. Lamentamos que o atendimento não tenha correspondido às suas expectativas. Gostaríamos de compreender melhor a situação e avaliar o que podemos melhorar. Agradecemos a oportunidade de melhorar.':positive>0?'Olá! Muito obrigado pelo seu feedback e pela confiança. Ficamos contentes por saber que teve uma boa experiência. Esperamos recebê-lo novamente em breve.':null};
}
