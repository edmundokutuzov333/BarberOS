import { z } from 'zod';
import { invokeTokenGateway } from '@/features/appointments/token-gateway';
import { supabase } from '@/lib/supabase';
import { scenarios } from './simulator-api';
const checkoutUrl=String(import.meta.env.VITE_SUPABASE_URL??'');
export const operationalSimulatorEnabled=import.meta.env.VITE_PAYMENT_SIMULATOR_ENABLED==='true' && (/^https:\/\/asikuyxaapcmayptimxi\.supabase\.co\/?$/.test(checkoutUrl)||/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(checkoutUrl));
export const qaCheckoutSlug='shop-phase8-preview-qa';
export const qaCheckoutShop='f86dc636-68ed-40ba-8a42-ce64fa0806d1';
const purpose=z.enum(['deposit','service','product','subscription']);
const state=z.enum(['pending','paid','failed','refunded']);
const run=z.object({id:z.string().uuid(),purpose,reference:z.string(),amount_minor:z.number().int().positive(),status:state,outcome:z.string(),scenario:z.string(),real_money:z.literal(false),created_at:z.string(),events:z.array(z.object({action:z.string(),status:state,outcome:z.string(),created_at:z.string()}))});
const view=z.object({enabled:z.boolean(),quotes:z.array(z.object({purpose,amount_minor:z.number().int().nonnegative(),label:z.string(),period:z.string().optional()})),runs:z.array(run)});
export type CheckoutPurpose=z.infer<typeof purpose>;
export type CheckoutRun=z.infer<typeof run>;
export type CheckoutView=z.infer<typeof view>;
export type CheckoutScope={token:string}|{shopId:string};
export type CheckoutCommand={operation:'create',payload:{purpose:CheckoutPurpose,scenario:keyof typeof scenarios,request_id:string}}|{operation:'confirm'|'reconcile'|'refund'|'replay',payload:{run_id:string,request_id:string}};
async function call(scope:CheckoutScope,operation:string,payload:object){
 if('token' in scope)return invokeTokenGateway<unknown>('payment_simulator.checkout',{token:scope.token,operation,payload});
 // Same authenticated simulator boundary, with the existing staging-only edge.
 const {data,error}=await supabase.functions.invoke('payment-simulator',{body:{action:'checkout',payload:{shop_id:scope.shopId,operation,payload}}});
 if(error){const context=(error as {context?:Response}).context;let message='SIM_UNAVAILABLE';try{const parsed=z.object({error:z.string()}).safeParse(await context?.clone().json());if(parsed.success)message=parsed.data.error;}catch{/* use safe error */}throw new Error(message);}
 const parsed=z.object({ok:z.literal(true),data:z.unknown()}).parse(data);return parsed.data;
}
export async function getCheckout(scope:CheckoutScope){return view.parse(await call(scope,'list',{}));}
export async function executeCheckout(scope:CheckoutScope,command:CheckoutCommand){return run.parse(await call(scope,command.operation,command.payload));}
