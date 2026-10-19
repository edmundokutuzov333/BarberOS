import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, corsHeaders } from "../_shared/guard.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
    status: 405,
    headers: { ...cors, "content-type": "application/json" },
  });

  try {
    const { error } = await adminClient().from("barbershops").select("id").limit(1);
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, service: "barberos-api", checked_at: new Date().toISOString() }), {
      headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, service: "barberos-api" }), {
      status: 503,
      headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
    });
  }
});
