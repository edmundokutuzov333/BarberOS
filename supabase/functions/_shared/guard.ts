import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function clientIp(req: Request): string {
  const direct = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) throw new Error("SUPABASE_ENV_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  return { "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] ?? ""), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, idempotency-key", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
export async function consume(admin: SupabaseClient, bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("rate_limit_consume", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row?.allowed === true, retryAfter: Number(row?.retry_after_seconds ?? windowSeconds) };
}
