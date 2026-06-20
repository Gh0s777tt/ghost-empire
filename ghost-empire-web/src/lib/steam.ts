// src/lib/steam.ts
// Steam Web API — owned-games + vanity resolution for the game library. The key
// lives in STEAM_API_KEY (Vercel env). All calls are server-side only.
import { httpFetch } from "@/lib/http";

const STEAM_API = "https://api.steampowered.com";

function apiKey(): string {
  return process.env.STEAM_API_KEY ?? "";
}

export type SteamOwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number; // minutes
  img_icon_url?: string;
  rtime_last_played?: number; // unix seconds
};

/** Resolve a Steam vanity URL (steamcommunity.com/id/<name>) to a SteamID64. */
export async function resolveSteamVanity(vanity: string): Promise<string | null> {
  if (!apiKey() || !vanity) return null;
  try {
    const r = await httpFetch(`${STEAM_API}/ISteamUser/ResolveVanityURL/v1/?key=${apiKey()}&vanityurl=${encodeURIComponent(vanity)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.response?.success === 1 ? String(d.response.steamid) : null;
  } catch {
    return null;
  }
}

/** Fetch the owned-games list for a SteamID64. Throws on a bad key / HTTP error. */
export async function fetchSteamOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
  if (!apiKey()) throw new Error("STEAM_API_KEY nie ustawiony");
  const url = `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey()}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`;
  const r = await httpFetch(url);
  if (!r.ok) throw new Error(`Steam GetOwnedGames HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.response?.games) ? d.response.games : [];
}

/** Capsule/header art for a Steam app — used as the game tile image. */
export function steamHeaderImage(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

/** Accepts a SteamID64, a full profile URL, or a vanity name → resolves to SteamID64. */
export async function coerceSteamId(input: string): Promise<string | null> {
  const s = input.trim();
  if (/^\d{17}$/.test(s)) return s; // already a SteamID64
  const profileMatch = s.match(/profiles\/(\d{17})/);
  if (profileMatch) return profileMatch[1];
  const idMatch = s.match(/\/id\/([^/]+)/);
  const vanity = idMatch ? idMatch[1] : s;
  return resolveSteamVanity(vanity);
}
