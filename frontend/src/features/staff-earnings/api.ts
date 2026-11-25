import {z} from 'zod';
import {supabase} from '@/lib/supabase';

const money=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const rate=z.number().int().min(0).max(10000).nullable();
const staffSchema=z.object({
 rates:z.array(z.object({barber_id:z.string().uuid(),name:z.string(),rate_bps:rate})),
 total:z.number().int().nonnegative(),
 summary:z.array(z.object({barber_id:z.string().uuid(),name:z.string(),completed_count:z.number().int().nonnegative(),unknown_count:z.number().int().nonnegative(),commission_minor:money,tip_minor:money})),
 appointments:z.array(z.object({id:z.string().uuid(),barber_id:z.string().uuid(),display_name:z.string(),starts_at:z.string(),price_cents:money,rate_bps:rate,commission_minor:money.nullable(),tip_minor:money}))
});
export type StaffEarnings=z.infer<typeof staffSchema>;
export type StaffRate=StaffEarnings['rates'][number];
export type StaffAppointment=StaffEarnings['appointments'][number];
export async function getStaffEarnings(shop:string,from:string,to:string,offset:number):Promise<StaffEarnings|null>{
 const {data,error}=await supabase.rpc('get_staff_earnings',{p_shop:shop,p_from:from,p_to:to,p_offset:offset});
 if(error){if(['PGRST202','42883'].includes(error.code))return null;throw error;}
 return staffSchema.parse(data);
}
export async function setCommissionRate(shop:string,barber:string,bps:number){
 const {data,error}=await supabase.rpc('set_staff_commission_rate',{p_shop:shop,p_barber:barber,p_rate_bps:bps});
 if(error)throw error;
 if(!data||typeof data!=='object'||Array.isArray(data)||data.barber_id!==barber||data.rate_bps!==bps)throw new Error('STAFF_WRITE_NOT_CONFIRMED');
}
export async function recordTip(shop:string,appointment:string,amount:number,expected:number,reason:string){
 const {data,error}=await supabase.rpc('record_staff_tip',{p_shop:shop,p_appointment:appointment,p_tip_minor:amount,p_expected_tip_minor:expected,p_reason:reason});
 if(error)throw error;
 if(!data||typeof data!=='object'||Array.isArray(data)||data.appointment_id!==appointment||data.tip_minor!==amount)throw new Error('STAFF_WRITE_NOT_CONFIRMED');
}
export function parseStaffDecimal(value:string,maxMinor:number){
 const s=value.trim().replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error('Introduza um número com até duas casas decimais.');
 const n=Math.round(Number(s)*100);
 if(!Number.isSafeInteger(n)||n<0||n>maxMinor)throw new Error('Valor fora dos limites permitidos.');
 return n;
}
