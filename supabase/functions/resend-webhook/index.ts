import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient } from "../_shared/guard.ts";

const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function verify(request: Request, body: string, secret: string): Promise<boolean> {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", bytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return signature.split(" ").some((part) => part.split(",")[1] === expected);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await request.text();
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET")?.trim() ?? "";
  if (!secret || !(await verify(request, body, secret))) return new Response("unauthorized", { status: 401 });
  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const eventMap: Record<string, string> = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained" };
  const mapped = event.type ? eventMap[event.type] : undefined;
  if (mapped && event.data?.email_id) {
    const { error } = await adminClient().rpc("record_email_event", { p_provider_message_id: event.data.email_id, p_event: mapped });
    if (error) return new Response("rpc error", { status: 500 });
  }
  return new Response("ok");
});
