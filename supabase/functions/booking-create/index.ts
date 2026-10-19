import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  extractDomainCode,
  httpStatusForDomainCode,
  publicBookingMessage,
} from "./contract.ts";
import { adminClient, clientIp, consume, corsHeaders, sha256Hex, verifyTurnstile } from "../_shared/guard.ts";

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type BookingPayload = {
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
};

function isValidPayload(value: unknown): value is BookingPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;

  return typeof body.p_slug === "string"
    && body.p_slug.trim().length > 0
    && body.p_slug.trim().length <= 120
    && isUuid(body.p_service_id)
    && (body.p_haircut_id === null || typeof body.p_haircut_id === "undefined" || isUuid(body.p_haircut_id))
    && (body.p_barber_id === null || typeof body.p_barber_id === "undefined" || isUuid(body.p_barber_id))
    && typeof body.p_start === "string"
    && body.p_start.length <= 80
    && !Number.isNaN(Date.parse(body.p_start))
    && typeof body.p_name === "string"
    && body.p_name.trim().length >= 2
    && body.p_name.trim().length <= 120
    && typeof body.p_phone === "string"
    && body.p_phone.trim().length >= 8
    && body.p_phone.trim().length <= 30
    && (body.p_email === null || typeof body.p_email === "undefined" || (
      typeof body.p_email === "string" && body.p_email.length <= 254
    ))
    && isUuid(body.idempotency_key)
    && (typeof body.turnstile_token === "undefined" || (
      typeof body.turnstile_token === "string" && body.turnstile_token.length <= 4096
    ));
}

function publicResponse(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (typeof response.manage_token !== "string") return null;
  return {
    ok: true,
    booking: {
      manage_token: response.manage_token,
      deposit_cents: Number(response.deposit_cents ?? 0),
      needs_payment: Boolean(response.needs_payment),
    },
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BOOKING_REQUEST_INVALID" }, 400);
  }

  if (!isValidPayload(body)) return json({ ok: false, error: "BOOKING_REQUEST_INVALID" }, 400);

  const payload = body as BookingPayload;
  try {
    const ip = clientIp(req);
    if (!(await verifyTurnstile(payload.turnstile_token, ip))) {
      return json({ ok: false, error: "BOT_CHECK_FAILED", message: publicBookingMessage("BOT_CHECK_FAILED") }, 403);
    }

    const admin = adminClient();
    const key = payload.idempotency_key;
    const { data: cached, error: cacheError } = await admin
      .from("booking_idempotency")
      .select("response")
      .eq("key", key)
      .maybeSingle();

    if (cacheError) throw new Error("IDEMPOTENCY_STORE_UNAVAILABLE");
    if (cached) {
      const response = publicResponse(cached.response);
      if (response) return json(response);
      if (cached.response === null) {
        return json(
          { ok: false, error: "IDEMPOTENCY_IN_PROGRESS", message: publicBookingMessage("IDEMPOTENCY_IN_PROGRESS") },
          409,
          { "retry-after": "2" },
        );
      }
      throw new Error("IDEMPOTENCY_STORE_UNAVAILABLE");
    }

    const salt = Deno.env.get("RATE_LIMIT_SALT")?.trim() ?? "";
    if (!salt) throw new Error("RATE_LIMIT_UNAVAILABLE");

    const ipHash = await sha256Hex(salt + ":" + ip);
    const phoneHash = await sha256Hex(salt + ":" + payload.p_phone.replace(/\D/g, ""));
    const slug = payload.p_slug.trim().toLowerCase();
    const buckets = [
      ["bk:ip:" + ipHash, 20, 3600],
      ["bk:phone:" + phoneHash, 6, 86400],
      ["bk:shop:" + slug, 300, 3600],
    ] as const;

    for (const [bucket, limit, windowSeconds] of buckets) {
      const result = await consume(admin, bucket, limit, windowSeconds);
      if (!result.allowed) {
        return json(
          { ok: false, error: "RATE_LIMITED", message: publicBookingMessage("RATE_LIMITED") },
          429,
          { "retry-after": String(result.retryAfter) },
        );
      }
    }

    // The SQL RPC claims the idempotency key and creates/caches the booking in one transaction.
    const { data, error } = await admin.rpc("book_appointment_idempotent", {
      p_idempotency_key: key,
      p_slug: slug,
      p_service_id: payload.p_service_id,
      p_haircut_id: payload.p_haircut_id ?? null,
      p_barber_id: payload.p_barber_id ?? null,
      p_start: payload.p_start,
      p_name: payload.p_name.trim(),
      p_phone: payload.p_phone.trim(),
      p_email: payload.p_email?.trim() || null,
    });

    if (error) {
      const code = extractDomainCode(error);
      return json({ ok: false, error: code, message: publicBookingMessage(code) }, httpStatusForDomainCode(code));
    }

    const row = data?.[0];
    if (!row?.manage_token) return json({ ok: false, error: "BOOKING_EMPTY_RESPONSE" }, 500);

    return json({
      ok: true,
      booking: {
        manage_token: row.manage_token,
        deposit_cents: Number(row.deposit_cents ?? 0),
        needs_payment: Boolean(row.needs_payment),
      },
    });
  } catch (error) {
    const code = extractDomainCode(error);
    return json({ ok: false, error: code, message: publicBookingMessage(code) }, httpStatusForDomainCode(code));
  }
});
