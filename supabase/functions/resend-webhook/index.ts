import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/guard.ts";
import { verifyResendSignature } from "./signature.ts";

type ResendEvent = {
  type?: string;
  data?: { email_id?: string };
};

const eventMap: Record<string, "delivered" | "bounced" | "complained"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET")?.trim() ?? "";
  if (!secret) {
    // Treat missing setup as an operational outage, not as an invalid caller.
    // Resend can retry once the signed-webhook secret is configured.
    return new Response("webhook unavailable", { status: 503 });
  }

  const body = await request.text();
  if (!(await verifyResendSignature(request, body, secret))) {
    return new Response("unauthorized", { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const mapped = event.type ? eventMap[event.type] : undefined;
  // Acknowledge valid but currently unsupported events so the provider does not
  // retry events that this consumer intentionally does not persist.
  if (!mapped) return new Response("ok");

  const providerMessageId = event.data?.email_id?.trim();
  const providerEventId = request.headers.get("svix-id")?.trim();
  if (!providerMessageId || !providerEventId) {
    return new Response("invalid payload", { status: 400 });
  }

  try {
    const { error } = await adminClient().rpc("record_email_event", {
      p_provider_message_id: providerMessageId,
      p_event: mapped,
      p_provider_event_id: providerEventId,
    });
    if (error) return new Response("event persistence failed", { status: 500 });
  } catch {
    // Do not leak database errors or acknowledge an event that was not persisted.
    return new Response("event persistence failed", { status: 500 });
  }

  return new Response("ok");
});
