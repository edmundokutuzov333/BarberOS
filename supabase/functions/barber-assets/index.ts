import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PHOTO_IDS: Record<string, number> = {
  // The 22 haircut references used throughout the catalogue.
  "haircut-low-fade": 7389079,
  "haircut-mid-fade": 17086220,
  "haircut-high-fade": 6487911,
  "haircut-taper-fade": 7781848,
  "haircut-skin-fade": 4456516,
  "haircut-drop-fade": 7697319,
  "haircut-burst-fade": 35157692,
  "haircut-buzz-cut": 11744656,
  "haircut-crew-cut": 23531768,
  "haircut-caesar": 7447151,
  "haircut-french-crop": 9102985,
  "haircut-pompadour": 5337943,
  "haircut-quiff": 10090668,
  "haircut-slick-back": 32964273,
  "haircut-afro-shape-up": 12414341,
  "haircut-waves": 5839954,
  "haircut-twists": 1845923,
  "haircut-dreads-retwist": 19028067,
  "haircut-corte-a-tesoura": 14072328,
  "haircut-corte-infantil": 7697356,
  "haircut-design-freestyle": 37339534,
  "haircut-careca-a-navalha": 12464838,

  // Distinct photographic barbershop interiors for the public shop cards and covers.
  "shop-magoanine": 5152514,
  "shop-oryon": 12505400,
  "shop-matola": 7518728,

  // Four photographic barber portraits for each existing shop.
  "barber-magoanine-1": 7389079,
  "barber-magoanine-2": 35157692,
  "barber-magoanine-3": 12414341,
  "barber-magoanine-4": 19028067,
  "barber-matola-1": 17086220,
  "barber-matola-2": 23531768,
  "barber-matola-3": 5337943,
  "barber-matola-4": 14072328,
  "barber-oryon-1": 10090668,
  "barber-oryon-2": 5839954,
  "barber-oryon-3": 19225142,
  "barber-oryon-4": 7781848,

  // Service cards use the same curated photographic references, not illustrations.
  "service-corte-classico": 7447151,
  "service-degrade": 6487911,
  "service-corte-barba": 7697319,
  "service-barba-completa": 12464838,
  "service-corte-infantil": 7697356,
  "service-corte-tesoura": 14072328,
  "service-lavagem": 7518728,
  "service-coloracao": 5337943,
  "service-design-sobrancelha": 37339534,
  "service-waves": 5839954,
  "service-tratamento-capilar": 19028067,
  "service-corte-premium": 5152514,
  "service-depilacao-facial": 12464838,
  "service-relaxamento": 32964273,
  "service-dreads-retwist": 19028067,
};

const SAFE_FALLBACK_IDS = [7389079, 35157692, 7518728];

function pexelsUrl(photoId: number, width: number): string {
  return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

function responseHeaders(contentType = "image/jpeg"): Headers {
  return new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders() });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: responseHeaders("text/plain; charset=utf-8") });
  }

  const asset = new URL(request.url).searchParams.get("asset")?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9-]{3,80}$/.test(asset) || !(asset in PHOTO_IDS)) {
    return new Response("Unknown photographic asset", { status: 404, headers: responseHeaders("text/plain; charset=utf-8") });
  }

  const width = asset.startsWith("shop-") ? 1600 : 1200;
  const photoIds = [...new Set([PHOTO_IDS[asset], ...SAFE_FALLBACK_IDS])];

  for (const photoId of photoIds) {
    try {
      const upstream = await fetch(pexelsUrl(photoId, width), {
        method: "GET",
        redirect: "follow",
        headers: {
          "Accept": "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8",
          "User-Agent": "BarberOS-PhotoCache/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) continue;

      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("image/")) continue;
      const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
      if (declaredLength > 8 * 1024 * 1024) continue;

      const bytes = await upstream.arrayBuffer();
      if (bytes.byteLength < 256 || bytes.byteLength > 8 * 1024 * 1024) continue;

      const headers = responseHeaders(contentType.split(";")[0] || "image/jpeg");
      headers.set("Content-Length", String(bytes.byteLength));
      headers.set("X-Photo-Asset", asset);
      return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers });
    } catch {
      // Try the next allowlisted photographic fallback.
    }
  }

  return new Response("Photographic asset temporarily unavailable", {
    status: 502,
    headers: responseHeaders("text/plain; charset=utf-8"),
  });
});
