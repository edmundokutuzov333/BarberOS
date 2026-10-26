import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

// Keep the public production origins working even when the optional runtime
// allowlist is missing. Unknown origins are still denied; this is not a wildcard.
const BUILTIN_ALLOWED_ORIGINS = [
  "https://barber-os-orpin.vercel.app",
  "https://barber-os-kutuzov.vercel.app",
  "https://barber-os-git-main-kutuzov.vercel.app",
] as const;

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

/**
 * A separate RATE_LIMIT_SALT is preferred. If it has not been provisioned,
 * use the server-only service-role key as a high-entropy fallback. It is never
 * returned to the client. Rotating that key resets hashed rate-limit buckets.
 */
export function rateLimitSalt(): string {
  return Deno.env.get("RATE_LIMIT_SALT")?.trim()
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || "";
}

export function corsHeaders(req: Request): Record<string, string> {
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set<string>([...BUILTIN_ALLOWED_ORIGINS, ...configuredOrigins]);
  const origin = req.headers.get("origin")?.trim() ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  // Never echo an untrusted Origin and never return a mismatched allow-origin.
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export async function consume(admin: SupabaseClient, bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("rate_limit_consume", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row?.allowed === true, retryAfter: Number(row?.retry_after_seconds ?? windowSeconds) };
}
