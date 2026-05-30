import { env } from "./env";

// Exchanges the stored Google refresh token for a fresh access token. Google
// access tokens last ~1h; the refresh token is long-lived and (unlike Kick) is
// NOT rotated, so the static value from `npm run auth:youtube` keeps working.
export async function refreshYouTubeToken(): Promise<{ access_token: string; expires_in: number } | null> {
  const { clientId, clientSecret, refreshToken } = env.youtube;
  if (!clientId || !clientSecret || !refreshToken) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!r.ok) {
      console.error("[youtube] token refresh failed:", r.status, await r.text());
      return null;
    }
    return (await r.json()) as { access_token: string; expires_in: number };
  } catch (e) {
    console.error("[youtube] token refresh error:", (e as Error).message);
    return null;
  }
}
