import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const purposes = { deposit: 'Sinal de marcação', service: 'Serviço', product: 'Produto da loja', subscription: 'Subscrição BarberOS' } as const;
export const scenarios = { success: 'Pagamento confirmado', insufficient_funds: 'Saldo insuficiente', cancelled: 'Cancelado pelo cliente', invalid_number: 'Número inválido', pending: 'Pendente e confirmado depois', timeout: 'Timeout e reconciliação', duplicate_callback: 'Callback duplicado', late_success: 'Pagamento após expiração', provider_error: 'Falha da operadora' } as const;
export type Purpose = keyof typeof purposes;
export type Scenario = keyof typeof scenarios;
export type Action = 'confirm' | 'reconcile' | 'refund' | 'replay';
const status = z.enum(['pending','paid','failed','refunded']);
const eventSchema = z.object({ id:z.string(), type:z.enum(['create','confirm','reconcile','refund','replay']), before:z.enum(['none','pending','paid','failed','refunded']), after:status, outcome:z.string(), created_at:z.string() });
const runSchema = z.object({
  id:z.string().uuid(), shop_id:z.string().uuid(), purpose:z.enum(['deposit','service','product','subscription']),
  scenario:z.enum(['success','insufficient_funds','cancelled','invalid_number','pending','timeout','duplicate_callback','late_success','provider_error']),
  amount_minor:z.number().int().min(1).max(2500000), status, outcome:z.string(),
  entitlement:z.enum(['waiting','confirmed','rejected','refund_required','reversed']),
  reference:z.string(), provider:z.literal('mpesa'), currency:z.literal('MZN'), real_money:z.literal(false),
  created_at:z.string(), updated_at:z.string(), events:z.array(eventSchema),
});
export type Run = z.infer<typeof runSchema>;
const listSchema = z.object({ shops:z.array(z.object({id:z.string().uuid(),name:z.string()})), runs:z.array(runSchema) });
export type SimulatorList = z.infer<typeof listSchema>;
const availabilitySchema=z.object({enabled:z.boolean()});

export type Command =
  | { action:'create'; payload:{ request_id:string; shop_id:string; purpose:Purpose; scenario:Scenario; amount_minor:number } }
  | { action:Action; payload:{ request_id:string; run_id:string } };

export const simulatorVisible = import.meta.env.VITE_PAYMENT_SIMULATOR_ENABLED === 'true' ||
  /^https:\/\/asikuyxaapcmayptimxi\.supabase\.co\/?$/.test(String(import.meta.env.VITE_SUPABASE_URL ?? ''));

async function invoke<T>(action:string,payload:object,schema:z.ZodType<T>):Promise<T>{
  const {data,error}=await supabase.functions.invoke('payment-simulator',{body:{action,payload}});
  if(error){
    const context=(error as {context?:Response}).context;
    let message='SIM_UNAVAILABLE';
    if(context){try{const value:unknown=await context.clone().json(); const parsed=z.object({error:z.string()}).safeParse(value); if(parsed.success)message=parsed.data.error;}catch{/* retain safe message */}}
    throw new Error(message);
  }
  const parsed=z.object({ok:z.literal(true),data:schema}).safeParse(data);
  if(!parsed.success)throw new Error('SIM_INVALID_RESPONSE');
  return parsed.data.data;
}
export const simulatorAvailability=()=>invoke('availability',{},availabilitySchema);
export const listSimulations=()=>invoke('list',{},listSchema);
export const executeSimulation=(command:Command)=>invoke(command.action,command.payload,runSchema);

export function amountToMinor(value:string):number|null{
  const normalized=value.trim().replace(',','.');
  if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(normalized))return null;
  const [whole,decimal='']=normalized.split('.');
  const minor=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  return minor>=1&&minor<=2500000?minor:null;
}
const errors:Record<string,string>={SIM_UNAVAILABLE:'Não foi possível comunicar com o laboratório. Tenta novamente.',SIM_DISABLED:'O laboratório está desligado neste ambiente.',SIM_INVALID_RESPONSE:'Resposta de teste inválida. Nenhum pagamento real foi efectuado.',SIM_RATE_LIMIT:'Limite de testes por minuto atingido. Aguarda antes de criar outro.',SIM_EVENT_LIMIT:'Este teste atingiu o limite de eventos. Cria uma nova simulação.',SIM_INVALID_TRANSITION:'O estado deste teste já não permite esta operação. Actualiza o histórico.',SIM_IDEMPOTENCY_CONFLICT:'A referência já foi utilizada com outros dados. Actualiza o histórico.',SIM_NOT_FOUND:'Simulação não encontrada.',PLATFORM_ADMIN_REQUIRED:'Apenas administradores da plataforma têm acesso.',PASSWORD_CHANGE_REQUIRED:'Altera primeiro a tua palavra-passe.',NOT_AUTHENTICATED:'A sessão expirou. Inicia sessão novamente.',SIM_INVALID_PAYLOAD:'Dados inválidos. Revê os campos.'};
export function simulationError(error:unknown){return errors[error instanceof Error?error.message:'']??'Não foi possível concluir o teste. Actualiza o histórico antes de repetir.'}
