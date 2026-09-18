import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function secretKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (direct) return direct;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed?.default) return String(parsed.default);
    const first = Object.values(parsed).find((v) => typeof v === "string");
    if (first) return String(first);
  } catch {}
  throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}

function json(body: unknown, status=200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type":"application/json","cache-control":"no-store" }});
}

function bearer(req: Request): string {
  const value=req.headers.get("authorization")||"";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

Deno.serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if (req.method!=="POST") return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);

  try {
    const accessToken=bearer(req);
    if (!accessToken) return json({ok:false,error:"NOT_AUTHENTICATED"},401);
    const url=Deno.env.get("SUPABASE_URL")!;
    const admin=createClient(url,secretKey(),{auth:{autoRefreshToken:false,persistSession:false}});
    const userResult=await admin.auth.getUser(accessToken);
    if (userResult.error || !userResult.data.user) return json({ok:false,error:"NOT_AUTHENTICATED"},401);
    const actor=userResult.data.user.id;

    const body=await req.json();
    const provider=body?.provider;
    const shop=body?.shop;
    if (!["mpesa","emola"].includes(provider) || typeof shop!=="string") return json({ok:false,error:"PAYMENT_REQUEST_INVALID"},400);

    const credentials=provider==="mpesa"
      ? { api_key:String(body?.credentials?.api_key||""), public_key:String(body?.credentials?.public_key||"") }
      : { username:String(body?.credentials?.username||""), password:String(body?.credentials?.password||""), api_key:String(body?.credentials?.api_key||"") };

    const publicConfig=provider==="mpesa"
      ? {
          base_url:String(body?.public_config?.base_url||""),
          service_provider_code:String(body?.public_config?.service_provider_code||""),
          origin:String(body?.public_config?.origin||"*"),
        }
      : {
          wsdl_url:String(body?.public_config?.wsdl_url||""),
          partner_code:String(body?.public_config?.partner_code||""),
          language:String(body?.public_config?.language||"pt"),
        };

    const {data,error}=await admin.rpc("set_payment_provider_account",{
      p_actor:actor,
      p_shop:shop,
      p_provider:provider,
      p_enabled:Boolean(body?.enabled),
      p_account_reference:typeof body?.account_reference==="string" ? body.account_reference : null,
      p_public_config:publicConfig,
      p_credentials:credentials,
    });
    if (error) return json({ok:false,error:error.message},400);

    return json({ok:true,account:data?.[0]||null});
  } catch (error) {
    return json({ok:false,error:error instanceof Error ? error.message : "PAYMENT_CONFIG_FAILED"},500);
  }
});
