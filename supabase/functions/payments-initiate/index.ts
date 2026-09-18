import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ProviderError, initiatePayment, type PaymentProvider, type ProviderConfig } from "./payment-providers.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

function secretKey(): string {
  const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if(direct) return direct;
  try {
    const parsed=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"");
    if(parsed?.default) return String(parsed.default);
    const first=Object.values(parsed).find((v)=>typeof v==="string");
    if(first) return String(first);
  } catch {}
  throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}
function json(body:unknown,status=200):Response{
  return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
}
function validProvider(value:unknown): value is PaymentProvider { return value==="mpesa" || value==="emola"; }

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);

  let body:any;
  try{ body=await req.json(); }catch{return json({ok:false,error:"PAYMENT_REQUEST_INVALID"},400);}
  if(typeof body?.token!=="string" || !validProvider(body?.provider) || typeof body?.msisdn!=="string"){
    return json({ok:false,error:"PAYMENT_REQUEST_INVALID"},400);
  }

  try{
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,secretKey(),{auth:{autoRefreshToken:false,persistSession:false}});
    const idempotency=typeof body?.idempotency_key==="string" ? body.idempotency_key : crypto.randomUUID();

    const {data:init,error:initError}=await admin.rpc("init_payment_from_token",{
      p_token:body.token,
      p_provider:body.provider,
      p_msisdn:body.msisdn,
      p_idempotency_key:idempotency,
    });
    if(initError) return json({ok:false,error:initError.message},400);
    const row=init?.[0];
    if(!row) return json({ok:false,error:"PAYMENT_EMPTY_RESPONSE"},500);

    const {data:runtime,error:runtimeError}=await admin.rpc("get_payment_runtime_config",{p_payment:row.payment_id});
    if(runtimeError || !runtime?.[0]) return json({ok:false,error:"PAYMENT_RUNTIME_UNAVAILABLE"},500);
    const r=runtime[0];

    const request={
      provider:r.provider as PaymentProvider,
      provider_ref:r.provider_ref as string,
      amount_cents:Number(r.amount_cents),
      msisdn:r.msisdn as string,
      public_config:(r.public_config||{}) as ProviderConfig,
      credentials:(r.credentials||{}) as ProviderConfig,
    };

    try{
      const result=await initiatePayment(request);
      await admin.rpc("mark_payment_provider_started",{
        p_payment:r.payment_id,
        p_provider_transaction_id:result.providerTransactionId||null,
        p_provider_status:result.providerStatus||"accepted",
        p_provider_message:result.providerMessage||null,
        p_raw:result.raw||{},
      });
      return json({
        ok:true,
        status:"pending",
        provider:r.provider,
        amount_cents:Number(r.amount_cents),
        hold_expires_at:row.hold_expires_at,
        message:result.providerMessage||"Pedido de pagamento enviado. Confirme no seu telemóvel.",
      });
    }catch(error){
      if(error instanceof ProviderError){
        if(error.retryable){
          await admin.rpc("mark_payment_provider_started",{
            p_payment:r.payment_id,
            p_provider_transaction_id:null,
            p_provider_status:"transport_pending",
            p_provider_message:error.message,
            p_raw:{provider_transport_error:true},
          });
          return json({
            ok:true,status:"pending",provider:r.provider,amount_cents:Number(r.amount_cents),
            hold_expires_at:row.hold_expires_at,
            message:"O pedido está a ser processado. Não repita o pagamento enquanto o estado é verificado.",
          });
        }
        await admin.rpc("finalize_payment_event",{
          p_payment:r.payment_id,p_state:"failed",
          p_provider_transaction_id:null,
          p_provider_status:error.message.split(":")[0],
          p_provider_message:error.message,
          p_raw:{provider_rejected:true},
        });
        return json({ok:false,error:error.message,terminal:true},400);
      }
      return json({ok:false,error:"PAYMENT_PROVIDER_REQUEST_FAILED"},502);
    }
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:"PAYMENT_INITIATION_FAILED"},500);
  }
});
