// src/lib/x-social.ts
// X (Twitter) public presence for a portal — the streamer's follower count + latest posts,
// via the X API v2 with an app Bearer token the streamer pastes in /admin#integrations
// (encrypted at rest, per portal). Cached (5 min, Redis) so portal renders don't hammer the
// X API. DORMANT — returns an empty "not configured" profile until a token + username are set,
// so every consumer degrades to rendering nothing (no error) with no key. Mirrors lib/rumble.ts.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { httpFetch } from "@/lib/http";
import { cacheJson } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("x-social");
const CACHE_MS = 5 * 60_000;

export type XPost = { id: string; text: string; createdAt: string | null; url: string };
export type XProfile = {
  configured: boolean;
  username: string | null;
  name: string | null;
  followers: number;
  avatarUrl: string | null;
  posts: XPost[];
};

const EMPTY: XProfile = { configured: false, username: null, name: null, followers: 0, avatarUrl: null, posts: [] };

// ---------------------------------------------------------------------------
// Pure parsers/helpers (no network/DB) — unit-tested.
// ---------------------------------------------------------------------------

/** Normalize a handle to a bare username: strips a leading @, an x.com/twitter.com URL
 *  wrapper, and whitespace; returns null if it isn't a valid 1–15 char X handle. */
export function normalizeXUsername(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim();
  const m = s.match(/(?:x\.com|twitter\.com)\/(@?[A-Za-z0-9_]{1,15})/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}

/** Parse the X API v2 `/users/by/username` payload into the bits we render. Null on a bad shape. */
export function parseXUser(
  json: unknown,
): { id: string; name: string | null; followers: number; avatarUrl: string | null } | null {
  const d = (json as { data?: unknown })?.data as
    | { id?: unknown; name?: unknown; public_metrics?: { followers_count?: unknown }; profile_image_url?: unknown }
    | undefined;
  if (!d || typeof d.id !== "string") return null;
  return {
    id: d.id,
    name: typeof d.name === "string" ? d.name : null,
    followers: Number(d.public_metrics?.followers_count ?? 0) || 0,
    // X returns the small "_normal" (48px) avatar; swap the suffix for the 400px variant.
    avatarUrl: typeof d.profile_image_url === "string" ? d.profile_image_url.replace("_normal.", "_400x400.") : null,
  };
}

/** Parse the X API v2 `/users/:id/tweets` payload into post cards. Empty array on a bad shape. */
export function parseXTweets(json: unknown, username: string): XPost[] {
  const arr = (json as { data?: unknown })?.data;
  if (!Array.isArray(arr)) return [];
  const out: XPost[] = [];
  for (const t of arr) {
    const tw = t as { id?: unknown; text?: unknown; created_at?: unknown };
    if (typeof tw.id !== "string" || typeof tw.text !== "string") continue;
    out.push({
      id: tw.id,
      text: tw.text,
      createdAt: typeof tw.created_at === "string" ? tw.created_at : null,
      url: `https://x.com/${username}/status/${tw.id}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-tenant creds + fetch.
// ---------------------------------------------------------------------------

/** Resolve a portal's X creds: per-tenant IntegrationConfig first, else the founder/legacy env. */
async function resolveXCreds(tenantId: string | null): Promise<{ token: string; username: string } | null> {
  try {
    const cfg = tenantId
      ? await prisma.integrationConfig.findFirst({ where: { tenantId }, select: { xApiToken: true, xUsername: true } })
      : await prisma.integrationConfig.findUnique({ where: { id: "default" }, select: { xApiToken: true, xUsername: true } });
    const token = decryptSecret(cfg?.xApiToken) || process.env.X_API_TOKEN || null;
    const username = normalizeXUsername(cfg?.xUsername);
    if (token && username) return { token, username };
  } catch {
    /* DB hiccup — treat as not configured */
  }
  return null;
}

/** The portal's X presence (follower count + latest posts), or an empty/not-configured profile. */
export async function getXProfile(tenantId: string | null = null): Promise<XProfile> {
  const creds = await resolveXCreds(tenantId);
  if (!creds) return EMPTY;
  const { token, username } = creds;

  return cacheJson(`x-social:${tenantId ?? "_default"}:${username}`, CACHE_MS, async () => {
    try {
      const headers = { authorization: `Bearer ${token}` };
      const ures = await httpFetch(
        `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics,profile_image_url,name`,
        { headers },
      );
      if (!ures.ok) throw new Error(`x users ${ures.status}`);
      const user = parseXUser(await ures.json());
      if (!user) return { ...EMPTY, configured: true, username };

      let posts: XPost[] = [];
      try {
        const tres = await httpFetch(
          `https://api.twitter.com/2/users/${user.id}/tweets?max_results=5&exclude=retweets,replies&tweet.fields=created_at`,
          { headers },
        );
        if (tres.ok) posts = parseXTweets(await tres.json(), username);
      } catch {
        /* tweets are best-effort — the profile card still shows without them */
      }

      return { configured: true, username, name: user.name, followers: user.followers, avatarUrl: user.avatarUrl, posts };
    } catch (e) {
      log.error("getXProfile failed", e);
      return { ...EMPTY, configured: true, username };
    }
  });
}
