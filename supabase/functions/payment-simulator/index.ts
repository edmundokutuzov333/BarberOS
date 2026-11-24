import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { browserCors, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const configuredOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const isStaging = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "") === "https://asikuyxaapcmayptimxi.supabase.co";
  const cors = browserCors(req, configuredOrigins + (isStaging ? ",https://barberos-payment-lab.vercel.app" : ""));
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
  if (req.method === "OPTIONS") return preflight(cors);
  if (req.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return respond({ error: "NOT_AUTHENTICATED" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return respond({ error: "SIM_UNAVAILABLE" }, 503);
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !user.user) return respond({ error: "NOT_AUTHENTICATED" }, 401);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 8192) return respond({ error: "SIM_INVALID_PAYLOAD" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid payload");
  } catch { return respond({ error: "SIM_INVALID_PAYLOAD" }, 400); }
  if (body.action === "checkout") {
    const p=body.payload as Record<string,unknown> | undefined;
    if (!p || typeof p.shop_id !== "string" || typeof p.operation !== "string" || !["list","create","confirm","reconcile","refund","replay"].includes(p.operation)) return respond({error:"SIM_INVALID_PAYLOAD"},400);
    const {data,error}=await client.rpc("payment_checkout_admin",{p_shop:p.shop_id,p_action:p.operation,p_payload:p.payload??{}});
    if(error){const code=/^(SIM_[A-Z_]+|PLATFORM_ADMIN_REQUIRED|PASSWORD_CHANGE_REQUIRED)$/.test(error.message)?error.message:error.code==="22P02"?"SIM_INVALID_PAYLOAD":"SIM_UNAVAILABLE";return respond({error:code},error.code==="42501"?403:error.code==="P0002"?404:code==="SIM_UNAVAILABLE"?503:400);}
    return respond({ok:true,data});
  }
  if (typeof body.action !== "string" || !["availability","list","create","confirm","reconcile","refund","replay"].includes(body.action))
    return respond({ error: "SIM_INVALID_ACTION" }, 400);
  const { data, error } = await client.rpc("payment_simulator", { p_action: body.action, p_payload: body.payload ?? {} });
  if (error) {
    const known = /^(SIM_[A-Z_]+|PLATFORM_ADMIN_REQUIRED|PASSWORD_CHANGE_REQUIRED)$/.test(error.message);
    const code = known ? error.message : error.code === "22P02" ? "SIM_INVALID_PAYLOAD" : "SIM_UNAVAILABLE";
    const status = error.code === "42501" || ["PLATFORM_ADMIN_REQUIRED","PASSWORD_CHANGE_REQUIRED"].includes(code) ? 403 :
      error.code === "P0002" ? 404 : code === "SIM_RATE_LIMIT" ? 429 :
      code === "SIM_UNAVAILABLE" ? 503 : 400;
    return respond({ error: code }, status);
  }
  return respond({ ok: true, data });
});
