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

type ShopOrderItemInput = {
  variant_id: string;
  qty: number;
  options: string[];
  fulfilment_mode: "consume_here" | "takeaway";
};

type BookingPayload = {
  p_slug: string;
  p_service_id: string;
  p_haircut_id: string | null;
  p_barber_id: string | null;
  p_start: string;
  p_name: string;
  p_phone: string;
  p_email: string | null;
  p_shop_items?: ShopOrderItemInput[];
  idempotency_key: string;
  turnstile_token?: string;
};

function isShopOrderItems(value: unknown): value is ShopOrderItemInput[] {
  if (typeof value === "undefined") return true;
  if (!Array.isArray(value) || value.length > 20) return false;
  const variants = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["variant_id", "qty", "options", "fulfilment_mode"].includes(key))) return false;
    if (!isUuid(row.variant_id) || !Number.isInteger(row.qty) || Number(row.qty) < 1 || Number(row.qty) > 100) return false;
    if (variants.has(String(row.variant_id).toLowerCase())) return false;
    variants.add(String(row.variant_id).toLowerCase());
    if (!Array.isArray(row.options) || row.options.length > 10
      || row.options.some((option) => typeof option !== "string" || option.trim().length < 1 || option.trim().length > 80)) return false;
    if (new Set(row.options as string[]).size !== row.options.length) return false;
    if (row.fulfilment_mode !== "consume_here" && row.fulfilment_mode !== "takeaway") return false;
  }
  return true;
}

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
    && isShopOrderItems(body.p_shop_items)
    && (typeof body.turnstile_token === "undefined" || (
      typeof body.turnstile_token === "string" && body.turnstile_token.length <= 4096
    ));
}

function publicResponse(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (typeof response.manage_token !== "string") return null;
  const booking: Record<string, unknown> = {
    manage_token: response.manage_token,
    deposit_cents: Number(response.deposit_cents ?? 0),
    needs_payment: Boolean(response.needs_payment),
  };
  const order = response.shop_order;
  if (order && typeof order === "object" && !Array.isArray(order)) {
    const summary = order as Record<string, unknown>;
    if (typeof summary.status !== "string"
      || !Number.isInteger(summary.item_count) || Number(summary.item_count) < 1
      || !Number.isSafeInteger(Number(summary.subtotal_minor)) || Number(summary.subtotal_minor) < 0) return null;
    booking.shop_order = {
      status: summary.status,
      item_count: Number(summary.item_count),
      subtotal_minor: Number(summary.subtotal_minor),
    };
  }
  return { ok: true, booking };
}

function fingerprintShape(payload: BookingPayload, slug: string, items: ShopOrderItemInput[]) {
  return {
    slug,
    service_id: payload.p_service_id,
    haircut_id: payload.p_haircut_id ?? null,
    barber_id: payload.p_barber_id ?? null,
    start: new Date(payload.p_start).toISOString(),
    name: payload.p_name.trim(),
    phone: payload.p_phone.trim(),
    email: payload.p_email?.trim() || null,
    shop_items: items.map((item) => ({
      variant_id: item.variant_id.toLowerCase(),
      qty: item.qty,
      options: [...item.options].map((option) => option.trim()).sort(),
      fulfilment_mode: item.fulfilment_mode,
    })),
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
    const slug = payload.p_slug.trim().toLowerCase();
    const shopItems = (payload.p_shop_items ?? []).map((item) => ({
      ...item,
      variant_id: item.variant_id.toLowerCase(),
      options: [...item.options].map((option) => option.trim()).sort(),
    }));
    const requestHash = await sha256Hex(JSON.stringify(fingerprintShape(payload, slug, shopItems)));

    // Legacy no-product idempotency rows may have no request_hash. Only those
    // old rows may be replayed without a fingerprint; all new requests are
    // fingerprinted by the atomic SQL transaction below.
    const result = await admin.from("booking_idempotency").select("response,request_hash").eq("key", key).maybeSingle();
    const cached = result.data as { response: unknown; request_hash?: string | null } | null;
    if (result.error) throw new Error("IDEMPOTENCY_STORE_UNAVAILABLE");
    if (cached) {
      if (cached.response === null) {
        return json({ ok: false, error: "IDEMPOTENCY_IN_PROGRESS", message: publicBookingMessage("IDEMPOTENCY_IN_PROGRESS") }, 409, { "retry-after": "2" });
      }

      if (cached.request_hash) {
        if (cached.request_hash !== requestHash) {
          return json({ ok: false, error: "IDEMPOTENCY_KEY_REUSED", message: publicBookingMessage("IDEMPOTENCY_KEY_REUSED") }, 409);
        }
      } else {
        const cachedValue = cached.response && typeof cached.response === "object" && !Array.isArray(cached.response)
          ? cached.response as Record<string, unknown> : null;
        if (shopItems.length > 0 || cachedValue?.shop_order) {
          return json({ ok: false, error: "IDEMPOTENCY_KEY_REUSED", message: publicBookingMessage("IDEMPOTENCY_KEY_REUSED") }, 409);
        }
      }

      const response = publicResponse(cached.response);
      if (response) return json(response);
      throw new Error("IDEMPOTENCY_STORE_UNAVAILABLE");
    }

    const salt = Deno.env.get("RATE_LIMIT_SALT")?.trim() ?? "";
    if (!salt) throw new Error("RATE_LIMIT_UNAVAILABLE");

    const ipHash = await sha256Hex(salt + ":" + ip);
    const phoneHash = await sha256Hex(salt + ":" + payload.p_phone.replace(/\D/g, ""));
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

    const { data, error } = await admin.rpc("book_appointment_with_shop_order_idempotent", {
      p_idempotency_key: key, p_slug: slug, p_service_id: payload.p_service_id,
      p_haircut_id: payload.p_haircut_id ?? null, p_barber_id: payload.p_barber_id ?? null,
      p_start: payload.p_start, p_name: payload.p_name.trim(), p_phone: payload.p_phone.trim(),
      p_email: payload.p_email?.trim() || null, p_shop_items: shopItems, p_request_hash: requestHash,
    });
    if (error) {
      const code = extractDomainCode(error);
      return json({ ok: false, error: code, message: publicBookingMessage(code) }, httpStatusForDomainCode(code));
    }
    const row = data?.[0];
    if (!row?.manage_token) return json({ ok: false, error: "BOOKING_EMPTY_RESPONSE" }, 500);
    const response = publicResponse({
      manage_token: row.manage_token,
      deposit_cents: Number(row.deposit_cents ?? 0),
      needs_payment: Boolean(row.needs_payment),
      shop_order: Number(row.shop_order_item_count ?? 0) > 0 ? {
        status: row.shop_order_status,
        item_count: Number(row.shop_order_item_count),
        subtotal_minor: Number(row.shop_subtotal_minor),
      } : null,
    });
    if (!response) return json({ ok: false, error: "BOOKING_EMPTY_RESPONSE" }, 500);
    return json(response);
  } catch (error) {
    const code = extractDomainCode(error);
    return json({ ok: false, error: code, message: publicBookingMessage(code) }, httpStatusForDomainCode(code));
  }
});
