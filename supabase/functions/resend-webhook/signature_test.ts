import { verifyResendSignature } from "./signature.ts";

const RAW_SECRET = "barberos-resend-webhook-test-key-32-bytes-minimum";
const TEST_SECRET = `whsec_${btoa(RAW_SECRET)}`;

async function signedRequest(
  body: string,
  options: { timestamp?: number; id?: string; version?: string; secret?: string } = {},
): Promise<Request> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const id = options.id ?? "msg_test_signature_01";
  const secret = options.secret ?? TEST_SECRET;
  const keyBytes = Uint8Array.from(
    atob(secret.replace(/^whsec_/, "")),
    (character) => character.charCodeAt(0),
  );
  const keyMaterial = new ArrayBuffer(keyBytes.byteLength);
  new Uint8Array(keyMaterial).set(keyBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  ))));
  return new Request("https://example.test/functions/v1/resend-webhook", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": `${options.version ?? "v1"},${signature}`,
    },
  });
}

Deno.test("accepts a valid, current Svix signature", async () => {
  const body = '{"type":"email.delivered","data":{"email_id":"email_test_01"}}';
  const request = await signedRequest(body);
  if (!(await verifyResendSignature(request, body, TEST_SECRET))) {
    throw new Error("expected valid signature to be accepted");
  }
});

Deno.test("rejects a body modified after signing", async () => {
  const body = '{"type":"email.delivered"}';
  const request = await signedRequest(body);
  if (await verifyResendSignature(request, '{"type":"email.bounced"}', TEST_SECRET)) {
    throw new Error("modified body must be rejected");
  }
});

Deno.test("rejects signatures outside the five-minute replay window", async () => {
  const timestamp = 1_700_000_000;
  const body = '{"type":"email.delivered"}';
  const request = await signedRequest(body, { timestamp });
  if (await verifyResendSignature(request, body, TEST_SECRET, timestamp + 301)) {
    throw new Error("stale signature must be rejected");
  }
});

Deno.test("rejects a non-numeric timestamp", async () => {
  const request = new Request("https://example.test/webhook", {
    method: "POST",
    headers: {
      "svix-id": "msg_test",
      "svix-timestamp": "not-a-timestamp",
      "svix-signature": "v1,not-a-signature",
    },
  });
  if (await verifyResendSignature(request, "{}", TEST_SECRET)) {
    throw new Error("malformed timestamp must be rejected");
  }
});

Deno.test("rejects missing Svix headers", async () => {
  const request = new Request("https://example.test/webhook", { method: "POST" });
  if (await verifyResendSignature(request, "{}", TEST_SECRET)) {
    throw new Error("missing headers must be rejected");
  }
});

Deno.test("rejects malformed webhook secrets without throwing", async () => {
  const request = await signedRequest("{}", { secret: TEST_SECRET });
  if (await verifyResendSignature(request, "{}", "whsec_?")) {
    throw new Error("malformed secret must be rejected");
  }
});

Deno.test("rejects unknown signature versions", async () => {
  const body = '{"type":"email.delivered"}';
  const request = await signedRequest(body, { version: "v2" });
  if (await verifyResendSignature(request, body, TEST_SECRET)) {
    throw new Error("unknown signature version must be rejected");
  }
});
