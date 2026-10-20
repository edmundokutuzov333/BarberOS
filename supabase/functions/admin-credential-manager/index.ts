import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type Action = "reset_password" | "list_events";

function json(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) throw new Error("SUPABASE_ENV_UNAVAILABLE");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function consume(admin: SupabaseClient, bucket: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("rate_limit_consume", {
    p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row?.allowed === true, retryAfter: Number(row?.retry_after_seconds ?? windowSeconds) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(Array.from(bytes, (v) => String.fromCharCode(v)).join(""));
  return "BOS-" + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, cors);

  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return json({ ok: false, error: "AUTH_REQUIRED" }, 401, cors);

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await req.json();
    if (!isObject(body)) return json({ ok: false, error: "INVALID_REQUEST" }, 400, cors);
    payload = body;
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400, cors);
  }

  const action = payload.action as Action;
  if (action !== "reset_password" && action !== "list_events") {
    return json({ ok: false, error: "INVALID_ACTION" }, 400, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim()
    || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim()
    || "";
  if (!supabaseUrl || !publicKey) return json({ ok: false, error: "AUTH_CONFIGURATION_UNAVAILABLE" }, 503, cors);

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(bearer[1]);
  const actor = authData.user;
  if (authError || !actor) return json({ ok: false, error: "AUTH_REQUIRED" }, 401, cors);

  const admin = adminClient();
  const { data: actorProfile, error: profileError } = await admin
    .from("profiles").select("is_platform_admin").eq("id", actor.id).maybeSingle();
  if (profileError) return json({ ok: false, error: "ADMIN_CHECK_UNAVAILABLE" }, 503, cors);
  if (actorProfile?.is_platform_admin !== true) return json({ ok: false, error: "PLATFORM_ADMIN_REQUIRED" }, 403, cors);

  if (action === "list_events") {
    try {
      const limit = await consume(admin, "platform-credential-events:" + actor.id, 30, 60);
      if (!limit.allowed) return json({ ok: false, error: "RATE_LIMITED", retry_after_seconds: limit.retryAfter }, 429, cors);
      const { data, error } = await admin.from("platform_access_events")
        .select("id, actor_email, target_email, action, shop_slugs, created_at")
        .order("created_at", { ascending: false }).limit(50);
      if (error) return json({ ok: false, error: "AUDIT_LOG_UNAVAILABLE" }, 503, cors);
      return json({ ok: true, events: data ?? [] }, 200, cors);
    } catch {
      return json({ ok: false, error: "AUDIT_LOG_UNAVAILABLE" }, 503, cors);
    }
  }

  const targetUserId = payload.target_user_id;
  if (!isUuid(targetUserId)) return json({ ok: false, error: "INVALID_TARGET_USER" }, 400, cors);
  if (targetUserId === actor.id) return json({ ok: false, error: "SELF_RESET_NOT_ALLOWED" }, 400, cors);

  try {
    const targetLimit = await consume(admin, "platform-credential-reset:" + actor.id, 5, 3600);
    if (!targetLimit.allowed) return json({
      ok: false,
      error: "RATE_LIMITED",
      retry_after_seconds: targetLimit.retryAfter,
      message: "Limite de reposições atingido. Tente novamente mais tarde.",
    }, 429, cors);

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    const target = targetData.user;
    if (targetError || !target || !target.email) return json({ ok: false, error: "TARGET_USER_NOT_FOUND" }, 404, cors);

    const { data: memberships, error: membershipError } = await admin
      .from("barbershop_members").select("barbershop_id").eq("user_id", targetUserId);
    if (membershipError) return json({ ok: false, error: "MEMBERSHIP_LOOKUP_FAILED" }, 503, cors);
    if (!memberships?.length) return json({
      ok: false,
      error: "TARGET_NOT_A_BARBERSHOP_MEMBER",
      message: "Esta conta não pertence a uma barbearia.",
    }, 409, cors);

    const { data: targetProfile, error: targetProfileError } = await admin
      .from("profiles").select("is_platform_admin").eq("id", targetUserId).maybeSingle();
    if (targetProfileError) return json({ ok: false, error: "TARGET_PROFILE_LOOKUP_FAILED" }, 503, cors);
    if (targetProfile?.is_platform_admin === true) {
      return json({ ok: false, error: "PLATFORM_ADMIN_RESET_REQUIRES_SEPARATE_RECOVERY" }, 409, cors);
    }

    const shopIds = [...new Set(memberships.map((row) => row.barbershop_id))];
    const { data: shops, error: shopError } = await admin.from("barbershops").select("slug").in("id", shopIds);
    if (shopError) return json({ ok: false, error: "SHOP_LOOKUP_FAILED" }, 503, cors);
    const shopSlugs = (shops ?? []).map((row) => row.slug).filter((slug): slug is string => Boolean(slug));

    const { data: forceFlag, error: forceFlagError } = await admin.from("profiles")
      .update({ password_change_required: true })
      .eq("id", targetUserId)
      .select("id")
      .maybeSingle();
    if (forceFlagError || !forceFlag) return json({ ok: false, error: "PASSWORD_RESET_FAILED", message: "Não foi possível preparar a reposição segura." }, 503, cors);

    const nextPassword = temporaryPassword();
    const { error: passwordError } = await admin.auth.admin.updateUserById(targetUserId, { password: nextPassword });
    if (passwordError) {
      await admin.from("profiles").update({ password_change_required: false }).eq("id", targetUserId);
      return json({
        ok: false,
        error: "PASSWORD_RESET_FAILED",
        message: "Não foi possível actualizar a palavra-passe desta conta.",
      }, 503, cors);
    }

    const { error: auditError } = await admin.from("platform_access_events").insert({
      actor_user_id: actor.id,
      actor_email: actor.email ?? "(email indisponível)",
      target_user_id: targetUserId,
      target_email: target.email,
      action: "password_reset",
      shop_slugs: shopSlugs,
    });

    return json({
      ok: true,
      user: { id: targetUserId, email: target.email },
      shop_slugs: shopSlugs,
      temporary_password: nextPassword,
      shown_once: true,
      audit_logged: !auditError,
      warning: auditError ? "A palavra-passe foi alterada, mas não foi possível gravar o evento de auditoria." : undefined,
    }, 200, cors);
  } catch {
    return json({ ok: false, error: "CREDENTIAL_OPERATION_UNAVAILABLE" }, 503, cors);
  }
});
