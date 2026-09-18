import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { queryPayment, type PaymentProvider, type ProviderConfig } from "./payment-providers.ts";

function secretKey():string{
 const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim(); if(direct)return direct;
 try{const parsed=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"");if(parsed?.default)return String(parsed.default);const first=Object.values(parsed).find(v=>typeof v==="string");if(first)return String(first);}catch{}
 throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});}

Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 const secret=req.headers.get("x-barberos-cron-secret")?.trim()||"";
 try{
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,secretKey(),{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:valid,error:validError}=await admin.rpc("scheduler_secret_valid",{p_candidate:secret});
  if(validError||valid!==true)return json({ok:false,error:"UNAUTHORIZED"},401);

  const {data:batch,error:batchError}=await admin.rpc("list_payment_reconciliation_batch",{p_limit:25});
  if(batchError)return json({ok:false,error:"RECONCILIATION_QUEUE_FAILED"},500);

  let paid=0,failed=0,pending=0,errors=0;
  for(const item of batch||[]){
    const {data:claim}=await admin.rpc("claim_payment_reconciliation",{p_payment:item.payment_id,p_min_interval:"10 seconds"});
    if(!claim)continue;

    try{
      const {data:runtime,error:runtimeError}=await admin.rpc("get_payment_runtime_config",{p_payment:item.payment_id});
      if(runtimeError||!runtime?.[0]){errors++;continue;}
      const r=runtime[0];
      const result=await queryPayment({
        provider:r.provider as PaymentProvider,
        provider_ref:r.provider_ref as string,
        amount_cents:Number(r.amount_cents),
        msisdn:r.msisdn as string,
        public_config:(r.public_config||{}) as ProviderConfig,
        credentials:(r.credentials||{}) as ProviderConfig,
      });
      if(result.status==="paid"||result.status==="failed"){
        await admin.rpc("finalize_payment_event",{
          p_payment:r.payment_id,p_state:result.status,
          p_provider_transaction_id:result.providerTransactionId||null,
          p_provider_status:result.providerStatus||null,
          p_provider_message:result.providerMessage||null,
          p_raw:result.raw||{},
        });
        if(result.status==="paid")paid++;else failed++;
      }else{
        await admin.rpc("mark_payment_provider_started",{
          p_payment:r.payment_id,
          p_provider_transaction_id:result.providerTransactionId||null,
          p_provider_status:result.providerStatus||null,
          p_provider_message:result.providerMessage||null,
          p_raw:result.raw||{},
        });
        pending++;
      }
    }catch{
      errors++;
    }
  }

  return json({ok:true,checked:(batch||[]).length,paid,failed,pending,errors});
 }catch(error){
  return json({ok:false,error:error instanceof Error?error.message:"PAYMENT_RECONCILIATION_FAILED"},500);
 }
});
