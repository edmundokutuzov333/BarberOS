import { CalendarError } from "./errors.ts";

const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const PROVIDER_TIMEOUT_MS = 10_000;

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: { useDefault: true };
  visibility: "private";
  source: { title: string; url: string };
};
type Settings = { clientId: string; clientSecret: string; redirectUri: string };
type Transport = { fetcher?: typeof fetch; timeoutMs?: number };

async function request(url: string, init: RequestInit, transport: Transport): Promise<Response> {
  const timeout = transport.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 30_000) {
    throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
  }
  try {
    return await (transport.fetcher ?? fetch)(url, {
      ...init, redirect: "error", signal: AbortSignal.timeout(timeout),
    });
  } catch {
    // Never forward provider bodies, credentials, codes or transport URLs to UI.
    throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
  }
}

export async function exchangeCode(code: string, settings: Settings, transport: Transport = {}): Promise<string> {
  const response = await request(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: settings.clientId, client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri, grant_type: "authorization_code",
    }),
  }, transport);
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object" || !("access_token" in result)
    || typeof result.access_token !== "string" || !result.access_token.trim()) {
    throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
  }
  return result.access_token.trim();
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

async function verifyEvent(response: Response, expectedId: string): Promise<void> {
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== "object" || !("id" in result) || result.id !== expectedId
    || !("status" in result) || !["confirmed", "tentative"].includes(String(result.status))) {
    throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
  }
}

export async function createOrUpdateEvent(
  accessToken: string, event: CalendarEvent, transport: Transport = {},
): Promise<"added" | "updated"> {
  if (!accessToken.trim() || !/^[0-9a-v]{5,1024}$/.test(event.id)) {
    throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
  }
  const headers = { authorization: "Bearer " + accessToken, "content-type": "application/json" };
  const insert = await request(GOOGLE_EVENTS + "?sendUpdates=none", {
    method: "POST", headers, body: JSON.stringify(event),
  }, transport);
  if (insert.ok) { await verifyEvent(insert, event.id); return "added"; }
  const conflict = insert.status === 409;
  await discard(insert);
  if (conflict) {
    const { id: immutableEventId, ...patchBody } = event;
    const update = await request(GOOGLE_EVENTS + "/" + encodeURIComponent(immutableEventId) + "?sendUpdates=none", {
      method: "PATCH", headers, body: JSON.stringify(patchBody),
    }, transport);
    if (update.ok) { await verifyEvent(update, event.id); return "updated"; }
    await discard(update);
  }
  throw new CalendarError("GOOGLE_CALENDAR_PROVIDER_FAILED", 502);
}
