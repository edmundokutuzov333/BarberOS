import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, clientIp, consume, corsHeaders, sha256Hex } from "../_shared/guard.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = new Set(["morning", "afternoon", "evening", "any"]);

type WaitlistJoinPayload = {
  slug: string;
  service_id: string;
  haircut_id: string | null;
  barber_id: string | null;
  customer_name: string;
  phone: string;
  email: string | null;
  date_from: string;
  date_to: string;
  period: string;
};

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validPayload(value: unknown): value is WaitlistJoinPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const haircut = body.haircut_id;
  const barber = body.barber_id;
  const email = body.email;

  return typeof body.slug === "string" && body.slug.trim().length > 0 && body.slug.trim().length <= 120
    && UUID_PATTERN.test(String(body.service_id ?? ""))
    && (haircut === null || typeof haircut === "undefined" || UUID_PATTERN.test(String(haircut)))
    && (barber === null || typeof barber === "undefined" || UUID_PATTERN.test(String(barber)))
    && typeof body.customer_name === "string" && body.customer_name.trim().length >= 2 && body.customer_name.trim().length <= 120
    && typeof body.phone === "string" && body.phone.trim().length >= 8 && body.phone.trim().length <= 30
    && (email === null || typeof email === "undefined" || (typeof email === "string" && email.length <= 254))
    && isDate(body.date_from) && isDate(body.date_to) && body.date_to >= body.date_from
    && typeof body.period === "string" && PERIODS.has(body.period);
}

function errorCode(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  for (const code of [
    "BARBERSHOP_NOT_FOUND", "SERVICE_NOT_FOUND", "HAIRCUT_NOT_FOUND", "BARBER_NOT_FOUND",
    "INVALID_NAME", "INVALID_PHONE", "INVALID_EMAIL", "INVALID_DATE_RANGE", "INVALID_DATE",
    "WAITLIST_DATE_TOO_FAR", "WAITLIST_PERIOD_INVALID",
  ]) {
    if (message.includes(code)) return code;
  }
  return "WAITLIST_JOIN_FAILED";
}

const CLIENT_ERRORS = new Set([
  "BARBERSHOP_NOT_FOUND", "SERVICE_NOT_FOUND", "HAIRCUT_NOT_FOUND", "BARBER_NOT_FOUND",
  "INVALID_NAME", "INVALID_PHONE", "INVALID_EMAIL", "INVALID_DATE_RANGE", "INVALID_DATE",
  "WAITLIST_DATE_TOO_FAR", "WAITLIST_PERIOD_INVALID",
]);

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, ...extra, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "WAITLIST_REQUEST_INVALID" }, 400);
  }
  if (!validPayload(body)) return json({ ok: false, error: "WAITLIST_REQUEST_INVALID" }, 400);

  try {
    const salt = Deno.env.get("RATE_LIMIT_SALT")?.trim() ?? "";
    if (!salt) return json({ ok: false, error: "WAITLIST_GATEWAY_UNAVAILABLE" }, 503);

    const ip = clientIp(req);
    const ipHash = await sha256Hex(salt + ":waitlist-ip:" + ip);
    const phoneHash = await sha256Hex(salt + ":waitlist-phone:" + body.phone.replace(/\D/g, ""));
    const slug = body.slug.trim().toLowerCase();

    const admin = adminClient();
    const buckets = [
      ["wl:ip:" + ipHash, 12, 3600],
      ["wl:phone:" + phoneHash, 4, 86400],
      ["wl:shop:" + slug, 240, 3600],
    ] as const;

    for (const [bucket, limit, windowSeconds] of buckets) {
      const result = await consume(admin, bucket, limit, windowSeconds);
      if (!result.allowed) {
        return json(
          { ok: false, error: "RATE_LIMITED", retry_after_seconds: result.retryAfter },
          429,
          { "retry-after": String(result.retryAfter) },
        );
      }
    }

    const { data, error } = await admin.rpc("join_waitlist", {
      p_slug: slug,
      p_service_id: body.service_id,
      p_customer_name: body.customer_name.trim(),
      p_phone: body.phone.trim(),
      p_haircut_id: body.haircut_id ?? null,
      p_barber_id: body.barber_id ?? null,
      p_email: body.email?.trim() || null,
      p_date_from: body.date_from,
      p_date_to: body.date_to,
      p_period: body.period,
    });

    if (error) {
      const code = errorCode(error);
      return json({ ok: false, error: code }, CLIENT_ERRORS.has(code) ? 400 : 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.status || !row?.queued_at) return json({ ok: false, error: "WAITLIST_EMPTY_RESPONSE" }, 500);

    return json({ ok: true, waitlist: { status: row.status, queued_at: row.queued_at } });
  } catch {
    return json({ ok: false, error: "WAITLIST_GATEWAY_UNAVAILABLE" }, 503);
  }
});
