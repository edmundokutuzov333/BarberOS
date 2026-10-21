import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
const dec = new TextDecoder();
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
const ID_RE = /^[A-Za-z0-9_-]{1,256}$/;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

type ErrCode = "AUTH_REQUIRED" | "SHOP_REQUIRED" | "SHOP_ACCESS_DENIED" | "MANAGEMENT_ROLE_REQUIRED" |
  "GMAIL_CONFIGURATION_MISSING" | "GMAIL_STORAGE_NOT_READY" | "GMAIL_NOT_CONNECTED" |
  "GMAIL_REAUTH_REQUIRED" | "GMAIL_INVALID_REQUEST" | "GMAIL_PROVIDER_REQUEST_FAILED" |
  "GMAIL_RATE_LIMITED" | "GMAIL_SEND_FAILED" | "INTERNAL_ERROR";
class AppError extends Error {
  constructor(readonly code: ErrCode, readonly status = 500) { super(code); }
}
type Conn = {
  id: string; barbershop_id: string; connected_by: string | null; gmail_address: string;
  access_token_ciphertext: string; refresh_token_ciphertext: string; access_token_expires_at: string;
  granted_scopes: string[]; created_at: string; updated_at: string;
};
type Msg = { id?: string; threadId?: string; snippet?: string; labelIds?: string[]; payload?: Record<string, unknown> };
type Thread = { id?: string; snippet?: string; messages?: Msg[] };
type H = { name?: string; value?: string };

function val(key: string): string { return Deno.env.get(key)?.trim() ?? ""; }
function obj(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function code(error: unknown): ErrCode { return error instanceof AppError ? error.code : "INTERNAL_ERROR"; }
function status(error: unknown): number { return error instanceof AppError ? error.status : 500; }
function headers(req: Request): Record<string, string> {
  const origins = val("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  return {
    ...(origins.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  };
}
function reply(req: Request, body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), { status: statusCode, headers: {
    ...headers(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0",
    pragma: "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  }});
}
function adminClient(): SupabaseClient {
  const url = val("SUPABASE_URL"), key = val("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new AppError("GMAIL_CONFIGURATION_MISSING", 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function appUrl(): URL {
  let url: URL;
  try { url = new URL(val("GMAIL_APP_URL")); } catch { throw new AppError("GMAIL_CONFIGURATION_MISSING", 503); }
  if ((url.protocol !== "https:" && url.hostname !== "localhost") ||
    (val("ALLOWED_ORIGINS") && !val("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).includes(url.origin))) {
    throw new AppError("GMAIL_CONFIGURATION_MISSING", 503);
  }
  return url;
}
function settings() {
  const clientId = val("GMAIL_CLIENT_ID"), clientSecret = val("GMAIL_CLIENT_SECRET");
  const redirect = val("GMAIL_REDIRECT_URI"), encryptionKey = val("GMAIL_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !clientSecret || !redirect || encryptionKey.length < 32) throw new AppError("GMAIL_CONFIGURATION_MISSING", 503);
  let uri: URL;
  try { uri = new URL(redirect); } catch { throw new AppError("GMAIL_CONFIGURATION_MISSING", 503); }
  if (uri.protocol !== "https:" && uri.hostname !== "localhost") throw new AppError("GMAIL_CONFIGURATION_MISSING", 503);
  appUrl();
  return { clientId, clientSecret, redirect, encryptionKey };
}
function b64url(bytes: Uint8Array): string {
  let s = ""; for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64url(input: string): Uint8Array {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function hash(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function cipherKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(settings().encryptionKey));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(input: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(), enc.encode(input));
  return b64url(iv) + "." + b64url(new Uint8Array(out));
}
async function decrypt(input: string): Promise<string> {
  const p = input.split(".");
  if (p.length !== 2) throw new AppError("GMAIL_REAUTH_REQUIRED", 401);
  try { return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(p[0]) }, await cipherKey(), unb64url(p[1]))); }
  catch { throw new AppError("GMAIL_REAUTH_REQUIRED", 401); }
}
async function authUser(req: Request, admin: SupabaseClient) {
  const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!bearer) throw new AppError("AUTH_REQUIRED", 401);
  const { data, error } = await admin.auth.getUser(bearer[1]);
  if (error || !data.user) throw new AppError("AUTH_REQUIRED", 401);
  return data.user;
}
async function shopAccess(admin: SupabaseClient, userId: string, id: unknown): Promise<string> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("SHOP_REQUIRED", 400);
  const { data, error } = await admin.from("barbershop_members").select("role").eq("barbershop_id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new AppError("SHOP_ACCESS_DENIED", 503);
  if (!data) throw new AppError("SHOP_ACCESS_DENIED", 403);
  if (data.role !== "owner" && data.role !== "manager") throw new AppError("MANAGEMENT_ROLE_REQUIRED", 403);
  return id;
}
async function connectionFor(admin: SupabaseClient, shopId: string): Promise<Conn | null> {
  const { data, error } = await admin.from("gmail_connections")
    .select("id,barbershop_id,connected_by,gmail_address,access_token_ciphertext,refresh_token_ciphertext,access_token_expires_at,granted_scopes,created_at,updated_at")
    .eq("barbershop_id", shopId).maybeSingle();
  if (error) throw new AppError("GMAIL_STORAGE_NOT_READY", 503);
  return data as Conn | null;
}
async function googleToken(params: Record<string, string>) {
  const response = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !obj(data) || typeof data.access_token !== "string") {
    const invalid = obj(data) && data.error === "invalid_grant";
    throw new AppError(invalid ? "GMAIL_REAUTH_REQUIRED" : "GMAIL_PROVIDER_REQUEST_FAILED", invalid ? 401 : 502);
  }
  return {
    access: data.access_token,
    refresh: typeof data.refresh_token === "string" ? data.refresh_token : null,
    scopes: typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [],
    expires: new Date(Date.now() + Math.max(60, Number(data.expires_in ?? 3600)) * 1000).toISOString(),
  };
}
async function accessToken(admin: SupabaseClient, c: Conn, force = false): Promise<string> {
  if (!force && Date.parse(c.access_token_expires_at) > Date.now() + 60_000) return decrypt(c.access_token_ciphertext);
  const cfg = settings(), refresh = await decrypt(c.refresh_token_ciphertext);
  const token = await googleToken({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refresh, grant_type: "refresh_token" });
  const patch = {
    access_token_ciphertext: await encrypt(token.access), access_token_expires_at: token.expires,
    ...(token.refresh ? { refresh_token_ciphertext: await encrypt(token.refresh) } : {}), updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("gmail_connections").update(patch).eq("id", c.id);
  if (error) throw new AppError("GMAIL_STORAGE_NOT_READY", 503);
  Object.assign(c, patch);
  return token.access;
}
async function gmailApi(admin: SupabaseClient, c: Conn, path: string, init: RequestInit = {}): Promise<unknown> {
  let token = await accessToken(admin, c);
  const run = (bearer: string) => fetch(GMAIL + "/" + path, { ...init, headers: {
    ...Object.fromEntries(new Headers(init.headers).entries()), authorization: "Bearer " + bearer,
    ...(init.body ? { "content-type": "application/json" } : {}),
  }});
  let response = await run(token);
  if (response.status === 401) { token = await accessToken(admin, c, true); response = await run(token); }
  if (response.status === 401 || response.status === 403) throw new AppError("GMAIL_REAUTH_REQUIRED", 401);
  if (response.status === 429) throw new AppError("GMAIL_RATE_LIMITED", 429);
  if (!response.ok) throw new AppError("GMAIL_PROVIDER_REQUEST_FAILED", 502);
  if (response.status === 204) return {};
  return await response.json().catch(() => ({}));
}
function headerList(m: Msg): H[] {
  const items = m.payload?.headers;
  return Array.isArray(items) ? items.filter(obj) as H[] : [];
}
function header(m: Msg, name: string): string {
  return headerList(m).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function bodyPart(payload: Record<string, unknown>, mime: string): string {
  if (payload.mimeType === mime && obj(payload.body) && typeof payload.body.data === "string") {
    try { return dec.decode(unb64url(payload.body.data)); } catch { return ""; }
  }
  const parts = Array.isArray(payload.parts) ? payload.parts.filter(obj) : [];
  for (const part of parts) { const value = bodyPart(part, mime); if (value) return value; }
  return "";
}
function plainHtml(s: string): string {
  return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function bodyText(m: Msg): string {
  const p = m.payload; if (!p) return m.snippet ?? "";
  return bodyPart(p, "text/plain") || plainHtml(bodyPart(p, "text/html")) || m.snippet || "";
}
function safeId(id: unknown): string {
  if (typeof id !== "string" || !ID_RE.test(id)) throw new AppError("GMAIL_INVALID_REQUEST", 400);
  return id;
}
function sender(input: string): string { return (input.match(/<([^<>]+)>/)?.[1] ?? input).trim(); }
function b64utf8(s: string): string {
  const bytes = enc.encode(s); let raw = ""; for (const b of bytes) raw += String.fromCharCode(b); return btoa(raw);
}
function rawEmail(to: string, subject: string, body: string, extra: Record<string, string> = {}): string {
  const recipient = sender(to);
  if (!EMAIL_RE.test(recipient)) throw new AppError("GMAIL_INVALID_REQUEST", 400);
  const safeSub = subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const encodedSubject = /^[\x20-\x7e]*$/.test(safeSub) ? safeSub : "=?UTF-8?B?" + b64utf8(safeSub) + "?=";
  const text = b64utf8(body.replace(/\r\n/g, "\n").replace(/\r/g, "\n")).match(/.{1,76}/g)?.join("\r\n") ?? "";
  const raw = ["To: " + recipient, "Subject: " + encodedSubject,
    ...Object.entries(extra).map(([k,v]) => k + ": " + v.replace(/[\r\n]+/g, " ")),
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", text].join("\r\n");
  return b64url(enc.encode(raw));
}
async function readThread(admin: SupabaseClient, c: Conn, input: unknown) {
  const id = safeId(input), response = await gmailApi(admin, c, "threads/" + encodeURIComponent(id) + "?format=full");
  if (!obj(response)) throw new AppError("GMAIL_PROVIDER_REQUEST_FAILED", 502);
  const t = response as Thread;
  const messages = (t.messages ?? []).map((m) => ({
    id: m.id ?? "", from: header(m, "From"), to: header(m, "To"), cc: header(m, "Cc"),
    subject: header(m, "Subject"), date: header(m, "Date"), body: bodyText(m),
    message_id: header(m, "Message-ID"), references: header(m, "References"),
  }));
  return { id: t.id ?? id, messages };
}
async function listThreads(admin: SupabaseClient, c: Conn, search: unknown): Promise<Record<string, unknown>[]> {
  const term = typeof search === "string" ? search.trim().slice(0, 200) : "";
  const q = new URLSearchParams({ maxResults: "20", q: term ? "in:inbox " + term : "in:inbox" });
  const data = await gmailApi(admin, c, "threads?" + q);
  if (!obj(data) || !Array.isArray(data.threads)) return [];
  const threads = data.threads.filter(obj) as Array<{id?: string; snippet?: string}>;
  const result = await Promise.all(threads.slice(0,20).map(async (t) => {
    if (!t.id || !ID_RE.test(t.id)) return null;
    const d = await gmailApi(admin, c, "threads/" + encodeURIComponent(t.id) + "?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date");
    if (!obj(d)) return null;
    const messages = Array.isArray(d.messages) ? d.messages as Msg[] : [], last = messages.at(-1);
    if (!last) return null;
    return { id: t.id, snippet: t.snippet ?? last.snippet ?? "", from: header(last,"From"), to: header(last,"To"),
      subject: header(last,"Subject") || "(sem assunto)", date: header(last,"Date"),
      unread: messages.some((m) => m.labelIds?.includes("UNREAD")), message_count: messages.length };
  }));
  return result.filter((r): r is Record<string, unknown> => r !== null);
}
function redirect(params: Record<string,string>): Response {
  const url = new URL("/app/comunicacoes", appUrl());
  Object.entries(params).forEach(([key,v]) => url.searchParams.set(key,v));
  return new Response(null, { status: 302, headers: { location: url.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
async function oauthCallback(req: Request, admin: SupabaseClient): Promise<Response> {
  const url = new URL(req.url), state = url.searchParams.get("state") ?? "";
  if (!state || state.length > 512) return new Response("Invalid OAuth state", {status:400,headers:{"cache-control":"no-store"}});
  try { appUrl(); settings(); } catch { return new Response("Gmail integration not configured", {status:503,headers:{"cache-control":"no-store"}}); }
  const stateHash = await hash(state);
  const { data, error } = await admin.from("gmail_oauth_states").select("state_hash,barbershop_id,user_id,expires_at")
    .eq("state_hash",stateHash).gt("expires_at",new Date().toISOString()).maybeSingle();
  if (error) return redirect({gmail:"error",reason:"backend_not_ready"});
  if (!data) return redirect({gmail:"error",reason:"invalid_state"});
  const { error: deleteError } = await admin.from("gmail_oauth_states").delete().eq("state_hash",stateHash);
  if (deleteError) return redirect({gmail:"error",reason:"backend_not_ready"});
  if (url.searchParams.get("error")) return redirect({gmail:"error",reason:"consent_denied"});
  const authCode = url.searchParams.get("code");
  if (!authCode || authCode.length > 4096) return redirect({gmail:"error",reason:"invalid_response"});
  try {
    const cfg = settings();
    const token = await googleToken({code:authCode,client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:cfg.redirect,grant_type:"authorization_code"});
    if (!SCOPES.every((s) => token.scopes.includes(s))) throw new AppError("GMAIL_PROVIDER_REQUEST_FAILED",403);
    const resp = await fetch(GMAIL + "/profile", {headers:{authorization:"Bearer "+token.access}});
    const profile: unknown = await resp.json().catch(()=>({}));
    if (!resp.ok || !obj(profile) || typeof profile.emailAddress !== "string" || !EMAIL_RE.test(profile.emailAddress)) throw new AppError("GMAIL_PROVIDER_REQUEST_FAILED",502);
    const { data: member, error: memberError } = await admin.from("barbershop_members").select("role")
      .eq("barbershop_id",data.barbershop_id).eq("user_id",data.user_id).maybeSingle();
    if (memberError) throw new AppError("GMAIL_STORAGE_NOT_READY",503);
    if (!member) throw new AppError("SHOP_ACCESS_DENIED",403);
    if (member.role !== "owner" && member.role !== "manager") throw new AppError("MANAGEMENT_ROLE_REQUIRED",403);
    const oldResult = await admin.from("gmail_connections").select("gmail_address,refresh_token_ciphertext")
      .eq("barbershop_id",data.barbershop_id).maybeSingle();
    if (oldResult.error) throw new AppError("GMAIL_STORAGE_NOT_READY",503);
    const old = oldResult.data as {gmail_address:string;refresh_token_ciphertext:string} | null;
    const refreshCipher = token.refresh ? await encrypt(token.refresh) :
      old?.gmail_address.toLowerCase() === profile.emailAddress.toLowerCase() ? old.refresh_token_ciphertext : null;
    if (!refreshCipher) throw new AppError("GMAIL_PROVIDER_REQUEST_FAILED",502);
    const row = {barbershop_id:data.barbershop_id,connected_by:data.user_id,gmail_address:profile.emailAddress,
      access_token_ciphertext:await encrypt(token.access),refresh_token_ciphertext:refreshCipher,access_token_expires_at:token.expires,
      granted_scopes:token.scopes,updated_at:new Date().toISOString()};
    const {error: saveError} = await admin.from("gmail_connections").upsert(row,{onConflict:"barbershop_id"});
    if (saveError) throw new AppError("GMAIL_STORAGE_NOT_READY",503);
    return redirect({gmail:"connected",shop_id:data.barbershop_id});
  } catch (e) {
    const reason = e instanceof AppError && e.code === "GMAIL_CONFIGURATION_MISSING" ? "not_configured" :
      e instanceof AppError && e.code === "GMAIL_STORAGE_NOT_READY" ? "backend_not_ready" :
      e instanceof AppError && e.code === "SHOP_ACCESS_DENIED" ? "access_denied" : "provider_error";
    return redirect({gmail:"error",reason});
  }
}
async function mailStatus(admin: SupabaseClient, shop: string) {
  try { settings(); } catch { return {ok:true,configured:false,connection:{connected:false}}; }
  const c = await connectionFor(admin,shop);
  return {ok:true,configured:true,connection:c?{connected:true,email:c.gmail_address,connected_at:c.created_at,updated_at:c.updated_at}:{connected:false}};
}
async function sendMail(admin: SupabaseClient, c: Conn, p: Record<string,unknown>) {
  const body = typeof p.body === "string" ? p.body.trim() : "";
  if (!body || body.length > 50_000) throw new AppError("GMAIL_INVALID_REQUEST",400);
  let to: string, subject: string, threadId: string | undefined;
  const extra: Record<string,string> = {};
  if (typeof p.thread_id === "string" && p.thread_id) {
    threadId = safeId(p.thread_id);
    const thread = await readThread(admin,c,threadId);
    const messages = Array.isArray(thread.messages) ? thread.messages as Array<Record<string,unknown>> : [];
    const last = [...messages].reverse().find((m) => sender(String(m.from ?? "")).toLowerCase() !== c.gmail_address.toLowerCase());
    if (!last) throw new AppError("GMAIL_PROVIDER_REQUEST_FAILED",502);
    to = sender(String(last.from ?? ""));
    subject = String(last.subject ?? "").replace(/[\r\n]+/g," ").slice(0,200).trim();
    const msgId = String(last.message_id ?? "").trim(), refs = String(last.references ?? "").trim();
    if (msgId) extra["In-Reply-To"] = msgId;
    const joined = [refs,msgId].filter(Boolean).join(" ").slice(0,3000);
    if (joined) extra.References = joined;
    if (!subject.toLowerCase().startsWith("re:")) subject = "Re: " + subject;
  } else {
    to = typeof p.to === "string" ? p.to.trim() : "";
    subject = typeof p.subject === "string" ? p.subject.replace(/[\r\n]+/g," ").trim().slice(0,200) : "";
    if (!EMAIL_RE.test(to) || !subject) throw new AppError("GMAIL_INVALID_REQUEST",400);
  }
  if (!EMAIL_RE.test(to)) throw new AppError("GMAIL_INVALID_REQUEST",400);
  const raw = rawEmail(to,subject,body,extra);
  const result = await gmailApi(admin,c,"messages/send",{method:"POST",body:JSON.stringify({raw,...(threadId?{threadId}:{})})});
  if (!obj(result)) throw new AppError("GMAIL_SEND_FAILED",502);
  return {ok:true,message_id:result.id ?? null,thread_id:result.threadId ?? threadId ?? null};
}
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    try { return await oauthCallback(req,adminClient()); }
    catch { try { return redirect({gmail:"error",reason:"backend_not_ready"}); }
      catch { return new Response("Gmail not configured",{status:503,headers:{"cache-control":"no-store"}}); } }
  }
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:headers(req)});
  if (req.method !== "POST") return reply(req,{ok:false,error:"METHOD_NOT_ALLOWED"},405);
  let p: Record<string,unknown>;
  try { const raw: unknown=await req.json(); if(!obj(raw)) return reply(req,{ok:false,error:"GMAIL_INVALID_REQUEST"},400); p=raw; }
  catch { return reply(req,{ok:false,error:"GMAIL_INVALID_REQUEST"},400); }
  try {
    const admin=adminClient(), user=await authUser(req,admin), shop=await shopAccess(admin,user.id,p.shop_id);
    if (p.action === "status") return reply(req,await mailStatus(admin,shop));
    if (p.action === "connect") {
      const cfg=settings(), state=b64url(crypto.getRandomValues(new Uint8Array(32)));
      const {error}=await admin.from("gmail_oauth_states").insert({state_hash:await hash(state),barbershop_id:shop,user_id:user.id,expires_at:new Date(Date.now()+600_000).toISOString()});
      if(error) throw new AppError("GMAIL_STORAGE_NOT_READY",503);
      const url=new URL(GOOGLE_AUTH);
      url.search=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirect,response_type:"code",
        scope:["openid","email",...SCOPES].join(" "),access_type:"offline",prompt:"consent",include_granted_scopes:"true",state}).toString();
      return reply(req,{ok:true,url:url.toString()});
    }
    if (p.action === "disconnect") {
      const c=await connectionFor(admin,shop);
      if(!c) return reply(req,{ok:true,disconnected:true});
      try { await fetch(GOOGLE_REVOKE,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:await decrypt(c.refresh_token_ciphertext)})}); } catch { /* local deletion still required */ }
      const {error}=await admin.from("gmail_connections").delete().eq("id",c.id);
      if(error) throw new AppError("GMAIL_STORAGE_NOT_READY",503);
      return reply(req,{ok:true,disconnected:true});
    }
    const c=await connectionFor(admin,shop);
    if(!c) throw new AppError("GMAIL_NOT_CONNECTED",409);
    if(p.action==="list") return reply(req,{ok:true,threads:await listThreads(admin,c,p.search)});
    if(p.action==="thread") return reply(req,{ok:true,thread:await readThread(admin,c,p.thread_id)});
    if(p.action==="send") return reply(req,await sendMail(admin,c,p));
    throw new AppError("GMAIL_INVALID_REQUEST",400);
  } catch(e) { return reply(req,{ok:false,error:code(e)},status(e)); }
});
