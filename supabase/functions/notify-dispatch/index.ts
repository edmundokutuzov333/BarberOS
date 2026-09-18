import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

type DispatchJob = {
  id: string;
  barbershop_id: string;
  appointment_id: string | null;
  waitlist_entry_id: string | null;
  channel: "whatsapp" | "email";
  template_key: string;
  recipient: string;
  payload: Record<string, unknown>;
  scheduled_for: string;
  attempts: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service_name: string | null;
  haircut_name: string | null;
  barber_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  duration_min: number | null;
  shop_name: string;
  shop_slug: string;
  shop_phone: string | null;
  shop_whatsapp: string | null;
  timezone: string;
  manage_token: string | null;
  offer_token: string | null;
  offer_expires_at: string | null;
};

type TemplateData = {
  customerName: string;
  shopName: string;
  serviceName: string;
  haircutName: string;
  barberName: string;
  date: string;
  time: string;
  price: string;
  manageUrl: string;
  offerUrl: string;
  reviewUrl: string;
  expiresAt: string;
  shopPhone: string;
};

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const DEFAULT_BATCH = 25;
const MAX_BATCH = 100;
const MAX_ERROR = 700;

function env(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value || undefined;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, MAX_ERROR);
  return String(error ?? "notification_delivery_failed").slice(0, MAX_ERROR);
}

function publicUrl(): string {
  return (env("BARBEROS_PUBLIC_URL") || "").replace(/\/+$/, "");
}

function dateText(value: string | null, timezone: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: timezone || "Africa/Maputo",
    dateStyle: "medium",
  }).format(new Date(value));
}

function timeText(value: string | null, timezone: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: timezone || "Africa/Maputo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function expiryText(value: string | null, timezone: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: timezone || "Africa/Maputo",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function mzn(cents: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function text(value: string | null, fallback = "cliente"): string {
  return value?.trim() || fallback;
}

function urls(job: DispatchJob): { manageUrl: string; offerUrl: string } {
  const base = publicUrl();
  return {
    manageUrl: base && job.manage_token ? base + "/marcacao/" + job.manage_token : "",
    offerUrl: base && job.offer_token ? base + "/vaga/" + job.offer_token : "",
    reviewUrl: base && job.manage_token ? base + "/marcacao/" + job.manage_token + "/avaliar" : "",
  };
}

function dataFor(job: DispatchJob): TemplateData {
  const u = urls(job);
  return {
    customerName: text(job.customer_name),
    shopName: text(job.shop_name, "a barbearia"),
    serviceName: text(job.service_name, "o serviço"),
    haircutName: job.haircut_name?.trim() || "",
    barberName: text(job.barber_name, "o barbeiro"),
    date: dateText(job.starts_at, job.timezone),
    time: timeText(job.starts_at, job.timezone),
    price: mzn(job.price_cents),
    manageUrl: u.manageUrl,
    offerUrl: u.offerUrl,
    reviewUrl: u.reviewUrl,
    expiresAt: expiryText(job.offer_expires_at, job.timezone),
    shopPhone: job.shop_phone?.trim() || job.shop_whatsapp?.trim() || "",
  };
}

function messageFor(templateKey: string, d: TemplateData, job?: DispatchJob): string {
  switch (templateKey) {
    case "appointment_pending":
      return "Olá " + d.customerName + ". Recebemos a sua marcação na " + d.shopName +
        " para " + d.serviceName + " no dia " + d.date + " às " + d.time +
        ". Pode consultar ou gerir a marcação aqui: " + d.manageUrl;
    case "appointment_confirmed":
      return "Olá " + d.customerName + ". A sua marcação na " + d.shopName +
        " está confirmada para " + d.serviceName + ", dia " + d.date + " às " + d.time +
        ". Consulte os detalhes aqui: " + d.manageUrl;
    case "appointment_cancelled":
      return "Olá " + d.customerName + ". A sua marcação na " + d.shopName +
        " foi cancelada." + (d.shopPhone ? " Para esclarecimentos, contacte-nos pelo " + d.shopPhone + "." : "");
    case "appointment_rescheduled":
      return "Olá " + d.customerName + ". A sua marcação na " + d.shopName +
        " foi remarcada para " + d.date + " às " + d.time + ", com " + d.barberName +
        ". Consulte os detalhes aqui: " + d.manageUrl;
    case "reminder_24h":
      return "Olá " + d.customerName + ". Lembrete: amanhã tem marcação na " + d.shopName +
        " às " + d.time + " para " + d.serviceName + ". Detalhes: " + d.manageUrl;
    case "reminder_1h":
      return "Olá " + d.customerName + ". A sua marcação na " + d.shopName +
        " começa dentro de 1 hora, às " + d.time + ". Detalhes: " + d.manageUrl;
    case "waitlist_offer":
      return "Boa notícia, " + d.customerName + ". Surgiu uma vaga na " + d.shopName +
        ": " + d.serviceName + (d.haircutName ? ", " + d.haircutName : "") +
        ", dia " + d.date + " às " + d.time + " com " + d.barberName +
        ". A oferta fica reservada por 15 minutos, até " + d.expiresAt +
        ". Aceite aqui: " + d.offerUrl;
    case "review_request":
      return "Olá " + d.customerName + ". Esperamos que a sua visita à " + d.shopName +
        " tenha corrido bem. Pode consultar a sua marcação e dar-nos feedback aqui: " + d.manageUrl;
    case "daily_digest": {
      const p = job?.payload ?? {};
      const total = Number(p.today_total ?? 0);
      const confirmed = Number(p.today_confirmed ?? 0);
      const completed = Number(p.today_completed ?? 0);
      const noShow = Number(p.today_no_show ?? 0);
      const pending = Number(p.pending_deposits ?? 0);
      const waiting = Number(p.waitlist_waiting ?? 0);
      const revenue = mzn(Number(p.revenue_cents ?? 0));
      const localDate = String(p.local_date ?? d.date);
      return "Bom dia. Aqui está o resumo da " + d.shopName + " de " + localDate + ": " +
        total + " marcações hoje, " + confirmed + " confirmadas, " + completed +
        " concluídas, " + noShow + " faltas, " + pending + " sinais pendentes, " +
        waiting + " clientes na lista de espera e " + revenue + " de receita estimada.";
    }
    default:
      throw new Error("NOTIFICATION_TEMPLATE_UNSUPPORTED:" + templateKey);
  }
}

function subjectFor(templateKey: string, shopName: string): string {
  switch (templateKey) {
    case "appointment_pending": return "Marcação recebida na " + shopName;
    case "appointment_confirmed": return "Marcação confirmada na " + shopName;
    case "appointment_cancelled": return "Marcação cancelada na " + shopName;
    case "appointment_rescheduled": return "Marcação remarcada na " + shopName;
    case "reminder_24h": return "Lembrete: marcação amanhã na " + shopName;
    case "reminder_1h": return "Lembrete: marcação dentro de 1 hora na " + shopName;
    case "waitlist_offer": return "Surgiu uma vaga na " + shopName;
    case "review_request": return "Como correu a sua visita à " + shopName + "?";
    default: return shopName;
  }
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailHtml(message: string, label: string, url: string): string {
  return "<!doctype html><html lang=\"pt\"><body style=\"margin:0;background:#0b0b10;color:#f7f7fb;font-family:Arial,sans-serif\">" +
    "<div style=\"max-width:600px;margin:0 auto;padding:32px 20px\"><div style=\"background:#15151d;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:28px\">" +
    "<div style=\"font-size:13px;color:#aaa;margin-bottom:20px\">BarberOS</div>" +
    "<div style=\"font-size:18px;line-height:1.5;margin-bottom:24px\">" + htmlEscape(message) + "</div>" +
    (url ? "<a href=\"" + htmlEscape(url) + "\" style=\"display:inline-block;background:#b899ff;color:#15151d;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:14px\">" +
      htmlEscape(label) + "</a>" : "") +
    "</div></div></body></html>";
}

function waNumber(value: string | null): string {
  return (value || "").replace(/\D/g, "");
}

function fallbackUrl(job: DispatchJob, message: string): string | null {
  const phone = waNumber(job.customer_phone || job.recipient);
  if (!phone) return null;
  return "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
}

function templates(): Record<string, { name: string; language: string; body_params?: string[] }> {
  const raw = env("WHATSAPP_TEMPLATES_JSON");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Error("WHATSAPP_TEMPLATES_JSON_INVALID");
  }
}

function waParam(key: string, d: TemplateData): string {
  switch (key) {
    case "customer_name": return d.customerName;
    case "shop_name": return d.shopName;
    case "service_name": return d.serviceName;
    case "haircut_name": return d.haircutName;
    case "barber_name": return d.barberName;
    case "date": return d.date;
    case "time": return d.time;
    case "price": return d.price;
    case "manage_url": return d.manageUrl;
    case "offer_url": return d.offerUrl;
    case "review_url": return d.reviewUrl;
    case "expires_at": return d.expiresAt;
    case "shop_phone": return d.shopPhone;
    default: return "";
  }
}

async function sendWhatsApp(job: DispatchJob, message: string): Promise<string> {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");

  const to = waNumber(job.customer_phone || job.recipient);
  if (!to) throw new Error("WHATSAPP_RECIPIENT_INVALID");

  const config = templates()[job.template_key];
  const d = dataFor(job);
  const body: Record<string, unknown> = config
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: config.name,
          language: { code: config.language || "pt_PT" },
          components: config.body_params?.length
            ? [{ type: "body", parameters: config.body_params.map((key) => ({ type: "text", text: waParam(key, d) })) }]
            : undefined,
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      };

  const version = env("WHATSAPP_GRAPH_VERSION") || "v26.0";
  const response = await fetch(
    "https://graph.facebook.com/" + version + "/" + encodeURIComponent(phoneNumberId) + "/messages",
    {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error("WHATSAPP_" + response.status + ":" + raw.slice(0, MAX_ERROR));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  try {
    return JSON.parse(raw)?.messages?.[0]?.id || "whatsapp:accepted";
  } catch {
    return "whatsapp:accepted";
  }
}

async function sendEmail(job: DispatchJob, message: string): Promise<string> {
  const key = env("RESEND_API_KEY");
  const from = env("NOTIFICATION_EMAIL_FROM");
  if (!key || !from) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");

  const u = urls(job);
  const actionUrl = u.offerUrl || u.reviewUrl || u.manageUrl;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json",
      "Idempotency-Key": "barberos-notification-" + job.id,
    },
    body: JSON.stringify({
      from,
      to: [job.customer_email || job.recipient],
      subject: subjectFor(job.template_key, job.shop_name),
      html: emailHtml(message, job.offer_token ? "Aceitar vaga" : "Gerir marcação", actionUrl),
      text: message,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error("EMAIL_" + response.status + ":" + raw.slice(0, MAX_ERROR));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  try {
    return JSON.parse(raw)?.id || "email:accepted";
  } catch {
    return "email:accepted";
  }
}

function retryable(error: unknown): boolean {
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status)
    : NaN;
  return Number.isNaN(status) || status === 408 || status === 429 || status >= 500;
}

async function rpc(client: RpcClient, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error("RPC_" + name + ":" + result.error.message);
  return result.data;
}

async function markSent(client: RpcClient, job: DispatchJob, providerId: string, channel: string): Promise<void> {
  await rpc(client, "mark_notification_sent", {
    p_id: job.id,
    p_provider_message_id: providerId,
    p_meta: { delivered_channel: channel },
  });
}

async function dispatchOne(client: RpcClient, job: DispatchJob): Promise<Record<string, unknown>> {
  const d = dataFor(job);
  const message = messageFor(job.template_key, d, job);
  const fallback = fallbackUrl(job, message);

  try {
    if (job.channel === "whatsapp") {
      const id = await sendWhatsApp(job, message);
      await markSent(client, job, id, "whatsapp");
      return { id: job.id, status: "sent", provider: "whatsapp", fallback_url: fallback };
    }

    const id = await sendEmail(job, message);
    await markSent(client, job, id, "email");
    return { id: job.id, status: "sent", provider: "email", fallback_url: fallback };
  } catch (primary) {
    if (job.channel === "email" && fallback) {
      try {
        const id = await sendWhatsApp(job, message);
        await markSent(client, job, id, "whatsapp_fallback");
        return { id: job.id, status: "sent", provider: "whatsapp_fallback", fallback_url: fallback };
      } catch (fallbackError) {
        const finalError = "primary=" + safeError(primary) + "; fallback=" + safeError(fallbackError);
        const row = await rpc(client, "mark_notification_failure", {
          p_id: job.id,
          p_error: finalError,
          p_retryable: retryable(primary) || retryable(fallbackError),
          p_fallback_url: fallback,
        });
        return { id: job.id, status: row?.[0]?.status === "queued" ? "retrying" : "failed", fallback_url: fallback };
      }
    }

    const row = await rpc(client, "mark_notification_failure", {
      p_id: job.id,
      p_error: safeError(primary),
      p_retryable: retryable(primary),
      p_fallback_url: fallback,
    });
    return { id: job.id, status: row?.[0]?.status === "queued" ? "retrying" : "failed", fallback_url: fallback };
  }
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    const cronSecret = req.headers.get("x-barberos-cron-secret")?.trim() || "";
    const secretOk = await rpc(ctx.supabaseAdmin as unknown as RpcClient, "scheduler_secret_valid", {
      p_candidate: cronSecret,
    });
    if (secretOk !== true) {
      return new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    let body: { limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Empty request body is valid.
    }

    const limit = Math.max(1, Math.min(Number(body.limit) || DEFAULT_BATCH, MAX_BATCH));
    const client = ctx.supabaseAdmin as unknown as RpcClient;

    try {
      await rpc(client, "recover_stuck_notifications", { p_after: "10 minutes" });
      const jobs = (await rpc(client, "claim_notifications", { p_limit: limit })) as DispatchJob[];
      const results: Record<string, unknown>[] = [];

      for (const job of jobs) {
        try {
          results.push(await dispatchOne(client, job));
        } catch (error) {
          results.push({ id: job.id, status: "failed", error: safeError(error) });
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        claimed: jobs.length,
        sent: results.filter((r) => r.status === "sent").length,
        retrying: results.filter((r) => r.status === "retrying").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: safeError(error) }), {
        status: 500,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
  }),
};
