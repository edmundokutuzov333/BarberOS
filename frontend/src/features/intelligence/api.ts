import { z } from 'zod';
import { supabase } from '@/lib/supabase';
const n=z.number().finite().nullable();
export const topics=['overview','agenda','finance','customers','team','stock','communications','marketing','setup'] as const;
export type Topic=typeof topics[number];
export const labels:Record<Topic,string>={overview:'Visão geral',agenda:'Agenda e procura',finance:'Receitas',customers:'Clientes',team:'Equipa',stock:'Loja e stock',communications:'Comunicações',marketing:'Marketing',setup:'Configuração'};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paths=z.enum(['/app/agenda','/app/horarios','/app/marcacoes','/app/lista-espera','/app/relatorios','/app/clientes','/app/loja/produtos','/app/notificacoes','/app/barbeiros']);
const suggestionList=z.array(z.string().min(1).max(150)).length(3);
const suggestions=z.object(Object.fromEntries(topics.map(t=>[t,suggestionList])) as Record<Topic,typeof suggestionList>);
const contract=z.object({suggestions,version:z.literal(1),range:z.object({today:date,from:date,to:date,previousFrom:date,previousTo:date,historyFrom:date}),topic:z.enum(topics),metrics:z.object({today:n,appointments:n,completed:n,noShow:n,occupancy:n,revenue:n,revenueChange:n,waiting:n,failedNotifications:n,customers:n,recentCustomers:n,lowStock:n}),insights:z.array(z.object({id:z.string(),category:z.enum(topics),title:z.string(),detail:z.string(),href:paths,priority:z.enum(['high','normal'])})),forecast:z.array(z.object({date,expected:z.number(),low:z.number(),high:z.number(),samples:z.number().int().min(4)})).max(7),answer:z.string(),cloud:z.object({status:z.enum(['available','disabled','generated','unavailable','quota']),advice:z.string().nullable()})});
export type Intelligence= z.infer<typeof contract>;
export async function loadIntelligence(shopId:string,days:7|30,topic:Topic,question?:string,cloud=false,contextTopic?:Topic){
  const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,days,topic,question,cloud,contextTopic}});
  if(error)throw new Error('Não foi possível consultar a inteligência de gestão. Confirme a sessão e tente novamente.');
  return contract.parse(data);
}

const frequency=z.object({label:z.string(),count:z.number().int().min(2)}).nullable();
const customerContract=z.object({version:z.literal(1),today:date,historyCount:z.number().int().nonnegative(),completed:z.number().int().nonnegative(),missed:z.number().int().nonnegative(),resolved:z.number().int().nonnegative(),cycleDays:n,cycleSamples:z.number().int().nonnegative(),lastVisit:date.nullable(),daysSinceVisit:n,indicativeReturnDate:date.nullable(),returnStatus:z.enum(['scheduled','insufficient','overdue','due','regular']),hasUpcoming:z.boolean(),noShowRate:n,risk:z.enum(['insufficient','review','normal']),frequentService:frequency,frequentHaircut:frequency,lastService:z.string().nullable(),draft:z.string().nullable()});
export async function loadCustomerIntelligence(shopId:string,customerId:string){
  const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,customerId,action:'customer',days:7,topic:'customers'}});
  if(error)throw new Error('INTELLIGENCE_CUSTOMER_UNAVAILABLE');
  return customerContract.parse(data);
}

const planContract=z.object({version:z.literal(1),today:date,days:z.array(z.object({date,weekday:z.string(),capacity:n,booked:n,remaining:n,occupancy:n,historicalOccupancy:n,samples:z.number().int().nonnegative(),signal:z.enum(['unknown','closed','busy','opportunity','monitor'])})).length(7),campaign:z.object({title:z.string(),reason:z.string(),body:z.string()}).nullable(),setup:z.object({step:z.number().int().min(0).max(9),total:z.literal(9),complete:z.boolean(),next:z.string().nullable()}).nullable()});
export async function loadOperationalPlan(shopId:string){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'operations',days:7,topic:'agenda'}});
 if(error)throw new Error('INTELLIGENCE_OPERATIONS_UNAVAILABLE');return planContract.parse(data);
}
export const draftKinds=['confirmation','reschedule','acknowledgement','feedback','return','information'] as const;
export type DraftKind=typeof draftKinds[number];
const draftContract=z.object({version:z.literal(1),kind:z.enum(draftKinds),subject:z.string().max(200),body:z.string().max(5000)});
export async function loadCommunicationDraft(shopId:string,kind:DraftKind){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'draft',kind,days:7,topic:'communications'}});
 if(error)throw new Error('INTELLIGENCE_DRAFT_UNAVAILABLE');return draftContract.parse(data);
}

const inventoryContract=z.object({version:z.literal(1),asOf:z.string(),windowDays:z.literal(30),trackedCount:z.number().int().nonnegative(),alertCount:z.number().int().nonnegative(),estimatedCount:z.number().int().nonnegative(),rows:z.array(z.object({id:z.string().uuid(),product:z.string(),variant:z.string(),stock:z.number().int().nonnegative(),threshold:z.number().int().nonnegative(),sold:z.number().int().nonnegative(),saleDays:z.number().int().nonnegative(),dailyRate:n,coverDays:n,suggestedUnits:n,signal:z.enum(['out','low','watch','ok'])})).max(50)});
const reviewContract=z.object({version:z.literal(1),sampleCount:z.number().int().nonnegative(),commentCount:z.number().int().nonnegative(),average:n,negative:z.number().int().nonnegative(),neutral:z.number().int().nonnegative(),positive:z.number().int().nonnegative(),stars:z.array(z.object({rating:z.number().int().min(1).max(5),count:z.number().int().nonnegative()})).length(5),topics:z.array(z.object({id:z.string(),label:z.string(),mentions:z.number().int().nonnegative(),lowRated:z.number().int().nonnegative()})),reply:z.string().nullable()});
export async function loadInventoryIntelligence(shopId:string){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'inventory',days:30,topic:'stock'}});
 if(error)throw new Error('INTELLIGENCE_INVENTORY_UNAVAILABLE');return inventoryContract.parse(data);
}
export async function loadReviewIntelligence(shopId:string){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'reviews',days:30,topic:'overview'}});
 if(error)throw new Error('INTELLIGENCE_REVIEWS_UNAVAILABLE');return reviewContract.parse(data);
}

const financeContract=z.object({version:z.literal(1),from:date,to:date,previousFrom:date,previousTo:date,revenue:n,previousRevenue:n,revenueChange:n,completed:n,completedChange:n,ticket:n,ticketChange:n,occupancy:n,commissionKnown:n,commissionUnknown:n,tips:n,afterCommission:n,serviceConsistent:z.boolean(),services:z.array(z.object({id:z.string(),name:z.string(),completed:n,revenue:n,share:n,ticket:n})).max(20),team:z.array(z.object({id:z.string(),name:z.string(),completed:n,revenue:n,capacity:n,occupancy:n,commission:n,afterCommission:n})).max(30),store:z.object({knownUnits:n,unknownUnits:n,knownCost:n,knownGrossMargin:n,complete:z.boolean()}).nullable(),insights:z.array(z.object({id:z.string(),text:z.string()}))});
export async function loadFinancialIntelligence(shopId:string,days:7|30){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'finance',days,topic:'finance'}});
 if(error)throw new Error('INTELLIGENCE_FINANCE_UNAVAILABLE');return financeContract.parse(data);
}

export const MAX_AUDIO_BYTES=8*1024*1024;
export const MAX_QUESTION_CHARS=12000;
export async function transcribeQuestion(shopId:string,audio:string,mime:string){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'voice',days:7,topic:'overview',audio,mime,consent:true}});
 if(error){const status=error.context?.status;if(status===429)throw new Error('VOICE_QUOTA');if(status===413)throw new Error('VOICE_SIZE');throw new Error('VOICE_UNAVAILABLE');}return z.object({version:z.literal(1),text:z.string().min(1).max(MAX_QUESTION_CHARS)}).parse(data);
}
export async function classifyCommunication(shopId:string,text:string){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'mail_intent',days:7,topic:'communications',text:text.slice(0,2000)}});
 if(error)throw new Error('MAIL_INTENT_UNAVAILABLE');return z.object({version:z.literal(1),kind:z.enum(draftKinds),ambiguous:z.boolean()}).parse(data);
}

export type SetupQuestion='what'|'why'|'verify';
export async function loadSetupGuide(shopId:string,step:number,intent:SetupQuestion){
 const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,action:'setup_guide',days:7,topic:'setup',step,intent}});
 if(error)throw new Error('SETUP_GUIDE_UNAVAILABLE');
 return z.object({version:z.literal(1),step:z.number().int().min(1).max(8),progress:z.number().int().min(0).max(9),title:z.string(),answer:z.string(),review:z.string()}).parse(data);
}
