import { z } from 'zod';
import { supabase } from '@/lib/supabase';
const n=z.number().finite().nullable();
export const topics=['overview','agenda','finance','customers','team','stock','communications','marketing','setup'] as const;
export type Topic=typeof topics[number];
export const labels:Record<Topic,string>={overview:'Visão geral',agenda:'Agenda e procura',finance:'Receitas',customers:'Clientes',team:'Equipa',stock:'Loja e stock',communications:'Comunicações',marketing:'Marketing',setup:'Configuração'};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paths=z.enum(['/app/agenda','/app/horarios','/app/marcacoes','/app/lista-espera','/app/relatorios','/app/clientes','/app/loja/produtos','/app/notificacoes','/app/barbeiros']);
const contract=z.object({version:z.literal(1),range:z.object({today:date,from:date,to:date,previousFrom:date,previousTo:date,historyFrom:date}),topic:z.enum(topics),metrics:z.object({today:n,appointments:n,completed:n,noShow:n,occupancy:n,revenue:n,revenueChange:n,waiting:n,failedNotifications:n,customers:n,recentCustomers:n,lowStock:n}),insights:z.array(z.object({id:z.string(),category:z.enum(topics),title:z.string(),detail:z.string(),href:paths,priority:z.enum(['high','normal'])})),forecast:z.array(z.object({date,expected:z.number(),low:z.number(),high:z.number(),samples:z.number().int().min(4)})).max(7),answer:z.string(),cloud:z.object({status:z.enum(['available','disabled','generated','unavailable','quota']),advice:z.string().nullable()})});
export type Intelligence= z.infer<typeof contract>;
export async function loadIntelligence(shopId:string,days:7|30,topic:Topic,question?:string,cloud=false){
  const {data,error}=await supabase.functions.invoke('barber-intelligence',{body:{shopId,days,topic,question,cloud}});
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
