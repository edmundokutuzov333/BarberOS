import { browserCors, preflight } from "./http.ts";

Deno.test("preflight is a bodyless 204 and preserves browser headers", async () => {
  const origin = "https://barber-os-orpin.vercel.app";
  const response = preflight(browserCors(new Request(origin, { headers: { origin } })));
  if (response.status !== 204 || await response.text() !== "") throw new Error("Invalid preflight");
  if (response.headers.get("Access-Control-Allow-Origin") !== origin) throw new Error("Trusted origin denied");
});

Deno.test("CORS rejects untrusted, suffix spoofed and absent origins", () => {
  for (const origin of ["https://evil.example", "https://barber-os-orpin.vercel.app.evil.example", "null", ""]) {
    const headers = browserCors(new Request("https://api.example", { headers: origin ? { origin } : {} }));
    if (headers["Access-Control-Allow-Origin"]) throw new Error("Untrusted origin accepted");
    if (headers.Vary !== "Origin") throw new Error("Cache isolation missing");
  }
});

Deno.test("explicit staging allowlist preserves production origins", () => {
  for (const origin of ["https://staging.example", "https://barber-os-orpin.vercel.app"]) {
    const headers = browserCors(new Request("https://api.example", { headers: { origin } }), " https://staging.example, ");
    if (headers["Access-Control-Allow-Origin"] !== origin) throw new Error("Allowed origin rejected");
  }
});
