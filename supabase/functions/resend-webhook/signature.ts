const encoder = new TextEncoder();

function decodeSecret(secret: string): Uint8Array | null {
  try {
    const encoded = secret.trim().replace(/^whsec_/, "");
    if (!encoded) return null;
    const decoded = atob(encoded);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/** Verify the Svix signature used by Resend webhooks against the exact raw body. */
export async function verifyResendSignature(
  request: Request,
  body: string,
  secret: string,
  nowSeconds = Date.now() / 1000,
): Promise<boolean> {
  const id = request.headers.get("svix-id")?.trim();
  const timestamp = request.headers.get("svix-timestamp")?.trim();
  const signatureHeader = request.headers.get("svix-signature")?.trim();

  if (!id || !timestamp || !signatureHeader || !/^\d{1,12}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    return false;
  }

  const keyBytes = decodeSecret(secret);
  if (!keyBytes?.length) return false;

  try {
    const keyMaterial = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(keyMaterial).set(keyBytes);
    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = new Uint8Array(await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${id}.${timestamp}.${body}`),
    ));
    const expected = btoa(String.fromCharCode(...mac));
    const candidates = signatureHeader.split(/\s+/).flatMap((part) => {
      const separator = part.indexOf(",");
      if (separator < 1) return [];
      const version = part.slice(0, separator);
      const encoded = part.slice(separator + 1);
      return version === "v1" && encoded ? [encoded] : [];
    });
    return candidates.some((candidate) => constantTimeEqual(candidate, expected));
  } catch {
    return false;
  }
}
