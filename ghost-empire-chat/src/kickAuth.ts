import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

// Kick uses OAuth 2.1 and may ROTATE the refresh token on every refresh (unlike
// Twitch, whose refresh token is static). So we can't rely on the static value
// from .env after the first refresh — we persist the latest refresh token to a
// gitignored file and reuse it across restarts.
// Path is overridable so container hosts can point it at a mounted volume
// (the file must survive redeploys — Kick rotates the refresh token each refresh).
const STORE = process.env.KICK_TOKEN_STORE || path.resolve(process.cwd(), ".kick-tokens.json");

function loadStoredRefresh(): string | undefined {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8")).refresh_token || undefined;
  } catch {
    return undefined; // no store yet
  }
}

function saveRefresh(token: string): void {
  try {
    // 0600 — plik trzyma długożyjący, ROTOWANY refresh token (sekret). Domyślne 0644
    // odsłoniłoby go innym userom na współdzielonym hoście. mode w writeFileSync działa
    // tylko przy TWORZENIU; chmodSync docisą uprawnienia także istniejącemu plikowi.
    fs.writeFileSync(STORE, JSON.stringify({ refresh_token: token }, null, 2), { mode: 0o600 });
    fs.chmodSync(STORE, 0o600);
  } catch (e) {
    console.warn("[kick] could not persist refresh token:", (e as Error).message);
  }
}

// Prefer a previously-rotated token from the store, falling back to .env.
let currentRefresh = loadStoredRefresh() ?? env.kick.refreshToken;

// Exchanges the stored refresh token for a fresh access token. Returns the raw
// access token (no prefix) or null if refresh isn't possible.
export async function refreshKickToken(): Promise<string | null> {
  const { clientId, clientSecret } = env.kick;
  if (!clientId || !clientSecret || !currentRefresh) return null;
  try {
    const r = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefresh,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!r.ok) {
      console.error("[kick] token refresh failed:", r.status, await r.text());
      return null;
    }
    const data = (await r.json()) as { access_token: string; refresh_token?: string };
    // Persist a rotated refresh token so the next refresh (and restarts) work.
    if (data.refresh_token && data.refresh_token !== currentRefresh) {
      currentRefresh = data.refresh_token;
      saveRefresh(currentRefresh);
    }
    return data.access_token;
  } catch (e) {
    console.error("[kick] token refresh error:", (e as Error).message);
    return null;
  }
}
