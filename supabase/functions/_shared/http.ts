const productionOrigins = [
  "https://barber-os-orpin.vercel.app",
  "https://barber-os-kutuzov.vercel.app",
  "https://barber-os-git-main-kutuzov.vercel.app",
];

export function browserCors(req: Request, configuredOrigins = ""): Record<string, string> {
  const allowed = new Set([...productionOrigins, ...configuredOrigins.split(",").map((s) => s.trim()).filter(Boolean)]);
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...(origin && allowed.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
}

export function preflight(headers: Record<string, string>): Response {
  return new Response(null, { status: 204, headers });
}
