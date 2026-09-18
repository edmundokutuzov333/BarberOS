import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { queryPayment, type PaymentProvider, type ProviderConfig } from "./payment-providers.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-barberos-payment-token","Access-Control-Allow-Methods":"POST, OPTIONS"};

function secretKey():string{
 const direct=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim(); if(direct)return direct;
 try{const parsed=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"");if(parsed?.default)return String(parsed.default);const first=Object.values(parsed).find(v=>typeof v==="string");if(first)return String(first);}catch{}
 throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});}
async function bodyText(req:Request):Promise<string>{return await req.text();}
function findValue(value:unknown, keys:Set<string>):string|null{
 if(value===null||value===undefined)return null;
 if(typeof value==="object"){
   for(const [k,v] of Object.entries(value as Record<string,unknown>)){
     if(keys.has(k.toLowerCase()) && (typeof v==="string"||typeof v==="number"))return String(v);
     const nested=findValue(v,keys); if(nested)return nested;
   }
 }
 return null;
}
function extractRef(provider:PaymentProvider,raw:string):string|null{
 const trimmed=raw.trim();
 try{
  const jsonBody=JSON.parse(trimmed);
  return findValue(jsonBody,new Set([
    "input_thirdpartyreference","thirdpartyreference","input_transactionreference","transactionreference",
    "provider_ref","providerref","transactionreference","thirdparty_ref","thirdpartyreference"
  ]));
 }catch{}
 const patterns=[
  /input[_-]?ThirdPartyReference[^>]*>([^<]+)</i,
  /input[_-]?TransactionReference[^>]*>([^<]+)</i,
  /ThirdPartyReference[^>]*>([^<]+)</i,
  /TransactionReference[^>]*>([^<]+)</i,
  /provider_ref["':=\s]+([A-Za-z0-9._-]+)/i,
 ];
 for(const p of patterns){const m=trimmed.match(p);if(m?.[1])return m[1].trim();}
 return null;
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 const parts=new URL(req.url).pathname.split("/").filter(Boolean);
 const ix=parts.indexOf("payments-webhook");
 if(ix<0 || !parts[ix+1] || !parts[ix+2] || !parts[ix+3])return json({ok:false,error:"WEBHOOK_ROUTE_INVALID"},404);
 const provider=parts[ix+1] as PaymentProvider;
 const account=parts[ix+2];
 const token=parts[ix+3];
 if(provider!=="mpesa" && provider!=="emola")return json({ok:false,error:"PAYMENT_PROVIDER_INVALID"},400);

 try{
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,secretKey(),{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:context,error:contextError}=await admin.rpc("get_payment_webhook_context",{p_account:account,p_token:token});
  const c=context?.[0];
  if(contextError || !c?.valid || c.provider!==provider)return json({ok:false,error:"UNAUTHORIZED"},401);

  const raw=await bodyText(req);
  const providerRef=extractRef(provider,raw);
  if(!providerRef)return json({ok:false,error:"PAYMENT_REFERENCE_MISSING"},400);

  const {data:found,error:foundError}=await admin.rpc("find_payment_by_provider_ref",{
    p_provider:provider,p_provider_ref:providerRef,p_account:account
  });
  if(foundError || !found?.[0])return json({ok:true,accepted:true,matched:false});

  const p=found[0];
  const {data:runtime,error:runtimeError}=await admin.rpc("get_payment_runtime_config",{p_payment:p.payment_id});
  if(runtimeError || !runtime?.[0])return json({ok:false,error:"PAYMENT_RUNTIME_UNAVAILABLE"},500);
  const r=runtime[0];

  const request={
    provider:r.provider as PaymentProvider,
    provider_ref:r.provider_ref as string,
    amount_cents:Number(r.amount_cents),
    msisdn:r.msisdn as string,
    public_config:(r.public_config||{}) as ProviderConfig,
    credentials:(r.credentials||{}) as ProviderConfig,
  };
  const result=await queryPayment(request);
  if(result.status==="paid"||result.status==="failed"){
    await admin.rpc("finalize_payment_event",{
      p_payment:r.payment_id,p_state:result.status,
      p_provider_transaction_id:result.providerTransactionId||null,
      p_provider_status:result.providerStatus||null,
      p_provider_message:result.providerMessage||null,
      p_raw:{webhook:(()=>{try{return JSON.parse(raw)}catch{return raw.slice(0,2000)}})(),query:result.raw||{}},
    });
  }else{
    await admin.rpc("mark_payment_provider_started",{
      p_payment:r.payment_id,
      p_provider_transaction_id:result.providerTransactionId||null,
      p_provider_status:result.providerStatus||null,
      p_provider_message:result.providerMessage||null,
      p_raw:{webhook_received:true},
    });
  }

  return json({ok:true,accepted:true,matched:true,status:result.status});
 }catch(error){
  return json({ok:false,error:error instanceof Error?error.message:"PAYMENT_WEBHOOK_FAILED"},502);
 }
});
