import { env } from "./env";

// Exchanges the stored refresh token for a fresh access token. Twitch access
// tokens expire in a few hours; the refresh token is long-lived. Returns the raw
// access token (no "oauth:" prefix) or null if refresh isn't possible.
export async function refreshAccessToken(): Promise<string | null> {
  const { clientId, clientSecret, refreshToken } = env.twitch;
  if (!clientId || !clientSecret || !refreshToken) return null;
  try {
    const r = await fetch("https://id.twitch.tv/oauth2/token", {
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
      console.error("[twitch] token refresh failed:", r.status, await r.text());
      return null;
    }
    const data = (await r.json()) as { access_token: string };
    return data.access_token;
  } catch (e) {
    console.error("[twitch] token refresh error:", (e as Error).message);
    return null;
  }
}
