import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, consume, corsHeaders, sha256Hex } from "../_shared/guard.ts";

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type TokenAction =
  | "appointment.get"
  | "appointment.reschedule_slots"
  | "appointment.cancel"
  | "appointment.reschedule"
  | "review.get"
  | "review.submit";

function json(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

function validBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, cors);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!validBody(parsed)) return json({ ok: false, error: "TOKEN_REQUEST_INVALID" }, 400, cors);
    body = parsed;
  } catch {
    return json({ ok: false, error: "TOKEN_REQUEST_INVALID" }, 400, cors);
  }

  const action = body.action as TokenAction;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN_PATTERN.test(token)) return json({ ok: false, error: "APPOINTMENT_NOT_FOUND" }, 404, cors);

  const allowedActions = new Set<TokenAction>([
    "appointment.get",
    "appointment.reschedule_slots",
    "appointment.cancel",
    "appointment.reschedule",
    "review.get",
    "review.submit",
    "waitlist.get",
    "waitlist.claim",
    "waitlist.expire",
  ]);
  if (!allowedActions.has(action)) return json({ ok: false, error: "TOKEN_ACTION_INVALID" }, 400, cors);

  if (action === "appointment.reschedule_slots"
    && (typeof body.date !== "string" || !DATE_PATTERN.test(body.date))) {
    return json({ ok: false, error: "TOKEN_REQUEST_INVALID" }, 400, cors);
  }
  if (action === "appointment.cancel"
    && (typeof body.reason !== "string" || body.reason.length > 500)) {
    return json({ ok: false, error: "TOKEN_REQUEST_INVALID" }, 400, cors);
  }
  if (action === "appointment.reschedule"
    && (typeof body.new_start !== "string" || body.new_start.length > 80 || Number.isNaN(Date.parse(body.new_start)))) {
    return json({ ok: false, error: "TOKEN_REQUEST_INVALID" }, 400, cors);
  }
  if (action === "review.submit"
    && (!Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5
      || (body.comment !== undefined && (typeof body.comment !== "string" || body.comment.length > 2000)))) {
    return json({ ok: false, error: "TOKEN_REQUEST_INVALID" }, 400, cors);
  }

  try {
    const admin = adminClient();
    if (action.startsWith("waitlist.")) {
      const { data: offer, error: lookupError } = await admin
        .from("waitlist_entries")
        .select("id, status, offer_expires_at")
        .eq("offer_token", token)
        .maybeSingle();

      if (lookupError) return json({ ok: false, error: "TOKEN_GATEWAY_UNAVAILABLE" }, 503, cors);
      if (!offer) return json({ ok: false, error: "WAITLIST_OFFER_NOT_FOUND" }, 404, cors);

      const expiresAt = offer.offer_expires_at ? Date.parse(offer.offer_expires_at) : Number.NaN;
      if (action === "waitlist.claim"
        && (offer.status !== "offered" || !offer.offer_expires_at || expiresAt <= Date.now())) {
        return json({ ok: false, error: "WAITLIST_OFFER_EXPIRED" }, 410, cors);
      }
      if (action === "waitlist.expire"
        && offer.status === "offered"
        && (!offer.offer_expires_at || expiresAt > Date.now())) {
        return json({ ok: false, error: "WAITLIST_OFFER_STILL_ACTIVE" }, 409, cors);
      }
    } else {
      const { data: appointment, error: lookupError } = await admin
        .from("appointments")
        .select("id, manage_token_expires_at")
        .eq("manage_token", token)
        .maybeSingle();

      if (lookupError) return json({ ok: false, error: "TOKEN_GATEWAY_UNAVAILABLE" }, 503, cors);
      if (!appointment || !appointment.manage_token_expires_at
        || Date.parse(appointment.manage_token_expires_at) <= Date.now()) {
        return json({ ok: false, error: "APPOINTMENT_NOT_FOUND" }, 404, cors);
      }
    }

    const salt = Deno.env.get("RATE_LIMIT_SALT")?.trim() ?? "";
    if (!salt) return json({ ok: false, error: "TOKEN_GATEWAY_UNAVAILABLE" }, 503, cors);
    const tokenHash = await sha256Hex(salt + ":" + token);
    const limit = await consume(admin, "token:" + tokenHash, 30, 60);
    if (!limit.allowed) {
      return json({ ok: false, error: "RATE_LIMITED", retry_after_seconds: limit.retryAfter }, 429, {
        ...cors,
        "retry-after": String(limit.retryAfter),
      });
    }

    let rpcName: string;
    let args: Record<string, unknown>;
    switch (action) {
      case "appointment.get":
        rpcName = "get_appointment_by_token";
        args = { p_token: token };
        break;
      case "appointment.reschedule_slots":
        rpcName = "get_reschedule_slots_by_token";
        args = { p_token: token, p_date: body.date };
        break;
      case "appointment.cancel":
        rpcName = "cancel_appointment_by_token";
        args = { p_token: token, p_reason: body.reason };
        break;
      case "appointment.reschedule":
        rpcName = "reschedule_appointment_by_token";
        args = { p_token: token, p_new_start: body.new_start };
        break;
      case "review.get":
        rpcName = "get_review_by_token";
        args = { p_token: token };
        break;
      case "review.submit":
        rpcName = "submit_review_by_token";
        args = { p_token: token, p_rating: Number(body.rating), p_comment: body.comment ?? null };
        break;
      case "waitlist.get":
        rpcName = "get_waitlist_offer";
        args = { p_token: token };
        break;
      case "waitlist.claim":
        rpcName = "claim_waitlist_offer";
        args = { p_token: token };
        break;
      case "waitlist.expire":
        rpcName = "expire_waitlist_offer";
        args = { p_token: token };
        break;
    }

    const { data, error } = await admin.rpc(rpcName, args as never);
    if (error) {
      const message = error.message ?? "";
      if (/WAITLIST_OFFER_NOT_FOUND/i.test(message)) {
        return json({ ok: false, error: "WAITLIST_OFFER_NOT_FOUND" }, 404, cors);
      }
      if (/WAITLIST_OFFER_EXPIRED/i.test(message)) {
        return json({ ok: false, error: "WAITLIST_OFFER_EXPIRED" }, 410, cors);
      }
      if (/WAITLIST_OFFER_STILL_ACTIVE|WAITLIST_OFFER_NOT_ACTIVE|WAITLIST_SLOT_TAKEN/i.test(message)) {
        return json({ ok: false, error: message.match(/WAITLIST_[A-Z_]+/)?.[0] ?? "WAITLIST_ACTION_FAILED" }, 409, cors);
      }
      if (/TOKEN_EXPIRED|APPOINTMENT_NOT_FOUND|INVALID_TOKEN/i.test(message)) {
        return json({ ok: false, error: "APPOINTMENT_NOT_FOUND" }, 404, cors);
      }
      if (/SLOT_TAKEN|SLOT_UNAVAILABLE/i.test(message)) {
        return json({ ok: false, error: "SLOT_TAKEN" }, 409, cors);
      }
      return json({ ok: false, error: "TOKEN_ACTION_FAILED" }, 400, cors);
    }
    return json({ ok: true, data }, 200, cors);
  } catch {
    return json({ ok: false, error: "TOKEN_GATEWAY_UNAVAILABLE" }, 503, cors);
  }
});
