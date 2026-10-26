import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  clientIp,
  consume,
  corsHeaders,
  rateLimitSalt,
  sha256Hex,
} from "../_shared/guard.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_APP_URL = "https://barber-os-orpin.vercel.app";
const KNOWN_APP_ORIGINS = new Set([
  "https://barber-os-orpin.vercel.app",
  "https://barber-os-kutuzov.vercel.app",
  "https://barber-os-git-main-kutuzov.vercel.app",
]);

type ErrCode =
  | "GOOGLE_CALENDAR_NOT_CONFIGURED"
  | "GOOGLE_CALENDAR_INVALID_REQUEST"
  | "GOOGLE_CALENDAR_APPOINTMENT_NOT_FOUND"
  | "GOOGLE_CALENDAR_APPOINTMENT_NOT_ACTIVE"
  | "GOOGLE_CALENDAR_RATE_LIMITED"
  | "GOOGLE_CALENDAR_PROVIDER_FAILED"
  | "GOOGLE_CALENDAR_STATE_INVALID";

class CalendarError extends Error {
  constructor(readonly code: ErrCode, readonly status = 500) {
    super(code);
  }
}

type Appointment = {
  shop_name: string;
  shop_slug: string;
  shop_address: string | null;
  timezone: string;
  customer_name: string;
  appointment_starts_at: string;
  appointment_ends_at: string;
  appointment_status: string;
  deposit_status: string;
  service_name: string;
  service_duration_min: number;
  haircut_name: string | null;
  barber_name: string;
  hold_expires_at: string | null;
};

type CalendarState = { v: 1; token: string; issued_at: number; nonce: string };

function val(key: string): string {
  return Deno.env.get(key)?.trim() ?? "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function redirectTo(url: URL): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: url.toString(),
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function config() {
  const clientId = val("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = val("GOOGLE_CALENDAR_CLIENT_SECRET");
  const stateSecret = val("GOOGLE_CALENDAR_STATE_SECRET");
  const supabaseUrl = val("SUPABASE_URL").replace(/\/+$/, "");
  if (!clientId || !clientSecret || stateSecret.length < 32 || !supabaseUrl) {
    throw new CalendarError("GOOGLE_CALENDAR_NOT_CONFIGURED", 503);
  }
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new CalendarError("GOOGLE_CALENDAR_NOT_CONFIGURED", 503);
  }
  if (parsed.protocol !== "https:") throw new CalendarError("GOOGLE_CALENDAR_NOT_CONFIGURED", 503);
  return {
    clientId,
    clientSecret,
    stateSecret,
    redirectUri: supabaseUrl + "/functions/v1/google-calendar",
  };
}

function appBaseUrl(): URL {
  let app: URL;
  try {
    app = new URL(val("GOOGLE_CALENDAR_APP_URL") || DEFAULT_APP_URL);
  } catch {
    throw new CalendarError("GOOGLE_CALENDAR_NOT_CONFIGURED", 503);
  }
  const allowed = new Set(KNOWN_APP_ORIGINS);
  for (const origin of val("ALLOWED_ORIGINS").split(",").map((item) => item.trim()).filter(Boolean)) {
    allowed.add(origin);
  }
  if (app.protocol !== "https:" || !allowed.has(app.origin)) {
    throw new CalendarError("GOOGLE_CALENDAR_NOT_CONFIGURED", 503);
  }
  return app;
}

function b64url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sealState(state: CalendarState): Promise<string> {
  const key = await encryptionKey(config().stateSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return b64url(iv) + "." + b64url(new Uint8Array(encrypted));
}

async function openState(value: string): Promise<CalendarState> {
  const parts = value.split(".");
  if (parts.length !== 2) throw new CalendarError("GOOGLE_CALENDAR_STATE_INVALID", 400);
  try {
    const key = await encryptionKey(config().stateSecret);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64url(parts[0]) },
      key,
      fromB64url(parts[1]),
    );
    const state: unknown = JSON.parse(new TextDecoder().decode(decrypted));
    if (!isObject(state)
      || state.v !== 1
      || typeof state.token !== "string"
      || !TOKEN_PATTERN.test(state.token)
      || typeof state.issued_at !== "number"
      || !Number.isFinite(state.issued_at)
      || Date.now() - state.issued_at > STATE_TTL_MS
      || state.issued_at > Date.now() + 30_000
      || typeof state.nonce !== "string"
      || state.nonce.length < 20) {
      throw new CalendarError("GOOGLE_CALENDAR_STATE_INVALID", 400);
    }
    return state as CalendarState;
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    throw new CalendarError("GOOGLE_CALENDAR_STATE_INVALID", 400);
  }
}

function landing(token?: string, status?: string): URL {
  const base = appBaseUrl();
  base.pathname = token && TOKEN_PATTERN.test(token) ? "/marcacao/" + token : "/";
  base.search = "";
  base.hash = "";
  if (status) base.searchParams.set("calendar", status);
  return base;
}

async function appointmentFor(admin: SupabaseClient, token: string): Promise<Appointment> {
  const { data, error } = await admin.rpc("get_appointment_by_token", { p_token: token });
  if (error) throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 503);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !isObject(row)) throw new CalendarError("GOOGLE_CALENDAR_APPOINTMENT_NOT_FOUND", 404);
  return row as Appointment;
}

function assertActiveAppointment(appointment: Appointment): void {
  const start = Date.parse(appointment.appointment_starts_at);
  const holdExpiry = appointment.hold_expires_at ? Date.parse(appointment.hold_expires_at) : null;
  if (!["pending", "confirmed"].includes(appointment.appointment_status)
    || !Number.isFinite(start)
    || start <= Date.now()
    || (appointment.deposit_status === "awaiting" && holdExpiry !== null && holdExpiry <= Date.now())) {
    throw new CalendarError("GOOGLE_CALENDAR_APPOINTMENT_NOT_ACTIVE", 409);
  }
}

async function authorize(req: Request, body: Record<string, unknown>): Promise<Response> {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!TOKEN_PATTERN.test(token)) throw new CalendarError("GOOGLE_CALENDAR_INVALID_REQUEST", 400);
  const settings = config();
  const admin = adminClient();
  const salt = rateLimitSalt();
  if (!salt) throw new CalendarError("GOOGLE_CALENDAR_NOT_CONFIGURED", 503);

  const ip = clientIp(req);
  const ipHash = await sha256Hex(salt + ":calendar-ip:" + ip);
  const tokenHash = await sha256Hex(salt + ":calendar-token:" + token);
  const [ipLimit, tokenLimit] = await Promise.all([
    consume(admin, "calendar-ip:" + ipHash, 60, 3600),
    consume(admin, "calendar-token:" + tokenHash, 10, 3600),
  ]);
  if (!ipLimit.allowed || !tokenLimit.allowed) throw new CalendarError("GOOGLE_CALENDAR_RATE_LIMITED", 429);

  const appointment = await appointmentFor(admin, token);
  assertActiveAppointment(appointment);

  const state: CalendarState = {
    v: 1,
    token,
    issued_at: Date.now(),
    nonce: b64url(crypto.getRandomValues(new Uint8Array(24))),
  };
  const authorizationUrl = new URL(GOOGLE_AUTH);
  authorizationUrl.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "online",
    include_granted_scopes: "true",
    state: await sealState(state),
  }).toString();
  return json(req, { ok: true, authorization_url: authorizationUrl.toString() });
}

async function exchangeCode(code: string) {
  const settings = config();
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !isObject(result) || typeof result.access_token !== "string") {
    throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
  }
  return result.access_token;
}

async function eventId(token: string): Promise<string> {
  // Google event IDs accept lowercase hexadecimal characters; deterministic IDs
  // prevent duplicate events if a callback is retried or the client repeats the action.
  return "b" + await sha256Hex("barberos-google-calendar:" + token);
}

function eventBody(appointment: Appointment, token: string, id: string) {
  const bookingUrl = new URL("/marcacao/" + token, appBaseUrl()).toString();
  const description = [
    "Serviço: " + appointment.service_name,
    appointment.haircut_name ? "Corte: " + appointment.haircut_name : null,
    "Barbeiro: " + appointment.barber_name,
    "Duração prevista: " + appointment.service_duration_min + " minutos",
    "Gerir marcação: " + bookingUrl,
    "Criado com BarberOS",
  ].filter(Boolean).join("\n");
  return {
    id,
    summary: appointment.shop_name + " · " + appointment.service_name,
    description,
    ...(appointment.shop_address ? { location: appointment.shop_address } : {}),
    start: { dateTime: appointment.appointment_starts_at, timeZone: appointment.timezone || "Africa/Maputo" },
    end: { dateTime: appointment.appointment_ends_at, timeZone: appointment.timezone || "Africa/Maputo" },
    reminders: { useDefault: true },
    visibility: "private",
    source: { title: "BarberOS", url: bookingUrl },
  };
}

async function createOrUpdateEvent(accessToken: string, appointment: Appointment, token: string): Promise<"added" | "updated"> {
  const id = await eventId(token);
  const body = eventBody(appointment, token, id);
  const headers = {
    authorization: "Bearer " + accessToken,
    "content-type": "application/json",
  };
  const insert = await fetch(GOOGLE_EVENTS + "?sendUpdates=none", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (insert.ok) return "added";
  if (insert.status === 409) {
    const update = await fetch(GOOGLE_EVENTS + "/" + encodeURIComponent(id), {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (update.ok) return "updated";
  }
  throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const stateValue = url.searchParams.get("state") ?? "";
  let state: CalendarState | null = null;
  try {
    if (stateValue) state = await openState(stateValue);
  } catch {
    return redirectTo(landing(undefined, "error"));
  }
  if (!state) return redirectTo(landing(undefined, "error"));
  if (url.searchParams.get("error")) {
    const reason = url.searchParams.get("error") === "access_denied" ? "denied" : "error";
    return redirectTo(landing(state.token, reason));
  }

  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 4096) return redirectTo(landing(state.token, "error"));
  try {
    const admin = adminClient();
    const appointment = await appointmentFor(admin, state.token);
    assertActiveAppointment(appointment);
    const accessToken = await exchangeCode(code);
    const result = await createOrUpdateEvent(accessToken, appointment, state.token);
    return redirectTo(landing(state.token, result));
  } catch (error) {
    const reason = error instanceof CalendarError && error.code === "GOOGLE_CALENDAR_APPOINTMENT_NOT_ACTIVE"
      ? "inactive"
      : "error";
    return redirectTo(landing(state.token, reason));
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    return await callback(req);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { ok: false, error: "GOOGLE_CALENDAR_INVALID_REQUEST" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, error: "GOOGLE_CALENDAR_INVALID_REQUEST" }, 400);
  }
  if (!isObject(body) || body.action !== "authorize") {
    return json(req, { ok: false, error: "GOOGLE_CALENDAR_INVALID_REQUEST" }, 400);
  }
  try {
    return await authorize(req, body);
  } catch (error) {
    const typed = error instanceof CalendarError ? error : new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 503);
    return json(req, { ok: false, error: typed.code }, typed.status);
  }
});
