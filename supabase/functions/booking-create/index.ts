import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  extractDomainCode,
  httpStatusForDomainCode,
  publicBookingMessage,
} from "./contract.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function serviceKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY_UNAVAILABLE");
  return key;
}

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
    && (body.p_email === null || typeof body.p_email === "undefined" || typeof body.p_email === "string");
}

Deno.serve(async (req) => {
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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await admin.rpc("book_appointment", {
      p_slug: body.p_slug.trim(),
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

    return json({
      ok: true,
      booking: {
        manage_token: row.manage_token,
        deposit_cents: Number(row.deposit_cents ?? 0),
        needs_payment: Boolean(row.needs_payment),
      },
    }, 200);
  } catch (error) {
    const code = extractDomainCode(error);
    return json({
      ok: false,
      error: code,
      message: publicBookingMessage(code),
    }, httpStatusForDomainCode(code));
  }
});
