/** Local disconnection must not depend on Google's availability. Only HTTP 200
 * confirms provider revocation; transport errors and rejected requests are not
 * silently reported as a revoked grant. No token or provider body is logged. */
export async function revokeGoogleGrant(
  decryptToken: () => Promise<string>,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: await decryptToken() }),
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status === 200;
  } catch {
    return false;
  }
}
