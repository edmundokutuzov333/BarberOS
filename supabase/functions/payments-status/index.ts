import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { queryPayment, type PaymentProvider, type ProviderConfig } from "../_shared/payment-providers.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function secretKey():string{
 const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim(); if(direct)return direct;
 try{const parsed=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"");if(parsed?.default)return String(parsed.default);const first=Object.values(parsed).find(v=>typeof v==="string");if(first)return String(first);}catch{}
 throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 let body:any;try{body=await req.json();}catch{return json({ok:false,error:"PAYMENT_REQUEST_INVALID"},400);}
 if(typeof body?.token!=="string")return json({ok:false,error:"PAYMENT_REQUEST_INVALID"},400);

 try{
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,secretKey(),{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:runtime,error:runtimeError}=await admin.rpc("get_payment_runtime_for_token",{p_token:body.token});
  if(runtimeError)return json({ok:false,error:"PAYMENT_STATUS_UNAVAILABLE"},500);
  const r=runtime?.[0];
  if(!r)return json({ok:true,status:"not_required",amount_cents:0,hold_expires_at:null});

  if(r.status!=="pending"){
    return json({ok:true,status:r.status,amount_cents:Number(r.amount_cents),hold_expires_at:null,requires_refund:Boolean(r.status==="paid" && body?.include_refund_flag ? false : false)});
  }

  const {data:claim,error:claimError}=await admin.rpc("claim_payment_reconciliation",{p_payment:r.payment_id,p_min_interval:"10 seconds"});
  if(claimError)return json({ok:false,error:"PAYMENT_RECONCILIATION_UNAVAILABLE"},500);
  if(!claim){
    return json({ok:true,status:"pending",amount_cents:Number(r.amount_cents),message:"Pagamento em verificação."});
  }

  const request={
    provider:r.provider as PaymentProvider,
    provider_ref:r.provider_ref as string,
    amount_cents:Number(r.amount_cents),
    msisdn:r.msisdn as string,
    public_config:(r.public_config||{}) as ProviderConfig,
    credentials:(r.credentials||{}) as ProviderConfig,
  };
  const result=await queryPayment(request);

  if(result.status==="paid" || result.status==="failed"){
    const {data:finalized,error:finalError}=await admin.rpc("finalize_payment_event",{
      p_payment:r.payment_id,p_state:result.status,
      p_provider_transaction_id:result.providerTransactionId||null,
      p_provider_status:result.providerStatus||null,
      p_provider_message:result.providerMessage||null,
      p_raw:result.raw||{},
    });
    if(finalError)return json({ok:false,error:"PAYMENT_FINALIZATION_FAILED"},500);
    const f=finalized?.[0];
    return json({
      ok:true,status:f?.payment_status||result.status,
      amount_cents:Number(r.amount_cents),
      appointment_status:f?.appointment_status||null,
      requires_refund:Boolean(f?.requires_refund),
      message:result.status==="paid"
        ? (f?.requires_refund ? "O pagamento foi recebido depois do prazo e precisa de confirmação da barbearia." : "Pagamento confirmado.")
        : (result.providerMessage||"O pagamento não foi concluído."),
    });
  }

  await admin.rpc("mark_payment_provider_started",{
    p_payment:r.payment_id,
    p_provider_transaction_id:result.providerTransactionId||null,
    p_provider_status:result.providerStatus||null,
    p_provider_message:result.providerMessage||null,
    p_raw:result.raw||{},
  });
  return json({ok:true,status:"pending",amount_cents:Number(r.amount_cents),message:result.providerMessage||"Pagamento em processamento."});
 }catch(error){
  return json({ok:false,error:error instanceof Error?error.message:"PAYMENT_STATUS_FAILED"},502);
 }
});
