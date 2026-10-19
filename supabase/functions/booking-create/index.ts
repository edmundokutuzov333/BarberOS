import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  extractDomainCode,
  httpStatusForDomainCode,
  publicBookingMessage,
} from "./contract.ts";
import { adminClient, clientIp, consume, corsHeaders, sha256Hex, verifyTurnstile } from "../_shared/guard.ts";

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidPayload(value: unknown): value is {
  p_slug: string;
  p_service_id: string;
  p_haircut_id: string | null;
  p_barber_id: string | null;
  p_start: string;
  p_name: string;
  p_phone: string;
  p_email: string | null;
  idempotency_key: string;
  turnstile_token?: string;
} {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;

  return typeof body.p_slug === "string"
    && body.p_slug.trim().length > 0
    && isUuid(body.p_service_id)
    && (body.p_haircut_id === null || typeof body.p_haircut_id === "undefined" || isUuid(body.p_haircut_id))
    && (body.p_barber_id === null || typeof body.p_barber_id === "undefined" || isUuid(body.p_barber_id))
    && typeof body.p_start === "string"
    && !Number.isNaN(Date.parse(body.p_start))
    && typeof body.p_name === "string"
    && typeof body.p_phone === "string"
    && (body.p_email === null || typeof body.p_email === "undefined" || typeof body.p_email === "string")
    && isUuid(body.idempotency_key);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BOOKING_REQUEST_INVALID" }, 400);
  }

  if (!isValidPayload(body)) {
    return json({ ok: false, error: "BOOKING_REQUEST_INVALID" }, 400);
  }

  try {
    const ip = clientIp(req);
    if (!(await verifyTurnstile(body.turnstile_token, ip))) return json({ ok: false, error: "BOT_CHECK_FAILED" }, 403);
    const admin = adminClient();
    const key = body.idempotency_key;
    const { data: previous } = await admin.from("booking_idempotency").select("response").eq("key", key).maybeSingle();
    if (previous?.response) return json(previous.response);
    const salt = Deno.env.get("RATE_LIMIT_SALT") ?? "";
    const ipHash = await sha256Hex(`${salt}:${ip}`);
    const phoneHash = await sha256Hex(`${salt}:${body.p_phone.replace(/\D/g, "")}`);
    for (const [bucket, limit, window] of [[`bk:ip:${ipHash}`, 20, 3600], [`bk:phone:${phoneHash}`, 6, 86400], [`bk:shop:${body.p_slug.trim().toLowerCase()}`, 300, 3600]] as const) {
      const result = await consume(admin, bucket, limit, window);
      if (!result.allowed) return json({ ok: false, error: "RATE_LIMITED" }, 429, { "retry-after": String(result.retryAfter) });
    }

    const { data, error } = await admin.rpc("book_appointment", {
      p_slug: body.p_slug.trim().toLowerCase(),
      p_service_id: body.p_service_id,
      p_haircut_id: body.p_haircut_id ?? null,
      p_barber_id: body.p_barber_id ?? null,
      p_start: body.p_start,
      p_name: body.p_name,
      p_phone: body.p_phone,
      p_email: body.p_email ?? null,
    });

    if (error) {
      const code = extractDomainCode(error);
      return json({
        ok: false,
        error: code,
        message: publicBookingMessage(code),
      }, httpStatusForDomainCode(code));
    }

    const row = data?.[0];
    if (!row?.manage_token) {
      return json({ ok: false, error: "BOOKING_EMPTY_RESPONSE" }, 500);
    }

    const response = {
      ok: true,
      booking: {
        manage_token: row.manage_token,
        deposit_cents: Number(row.deposit_cents ?? 0),
        needs_payment: Boolean(row.needs_payment),
      },
    };
    await admin.from("booking_idempotency").upsert({ key, response }, { onConflict: "key", ignoreDuplicates: true });
    return json(response, 200);
  } catch (error) {
    const code = extractDomainCode(error);
    return json({
      ok: false,
      error: code,
      message: publicBookingMessage(code),
    }, httpStatusForDomainCode(code));
  }
});
