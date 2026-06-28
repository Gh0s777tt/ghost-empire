// src/lib/meta-social.ts
// Instagram (Meta) public presence for a portal — the streamer's follower count + latest media,
// via the Instagram Graph API with a long-lived access token + IG business-account id the streamer
// pastes in /admin#integrations (encrypted at rest, per portal). Cached (5 min, Redis). DORMANT —
// returns an empty profile until a token + IG user id are set, so consumers render nothing (no
// error) with no creds. Mirrors lib/x-social.ts. NOTE: needs an IG Business/Creator account linked
// to a Facebook app + a token with instagram_basic/instagram_manage_insights — Meta's app review
// gates real access, so this stays dormant until the owner's Meta app is approved.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { httpFetch } from "@/lib/http";
import { cacheJson } from "@/lib/redis";
import { createLogger } from "@/lib/logger";

const log = createLogger("meta-social");
const CACHE_MS = 5 * 60_000;
const GRAPH = "https://graph.facebook.com/v21.0";

export type IgPost = { id: string; caption: string | null; permalink: string; imageUrl: string | null; createdAt: string | null };
export type IgProfile = {
  configured: boolean;
  username: string | null;
  followers: number;
  avatarUrl: string | null;
  posts: IgPost[];
};

const EMPTY: IgProfile = { configured: false, username: null, followers: 0, avatarUrl: null, posts: [] };

// ---------------------------------------------------------------------------
// Pure parsers (no network/DB) — unit-tested.
// ---------------------------------------------------------------------------

/** A valid IG numeric business-account id (the Graph API uses the numeric id, not the @handle). */
export function normalizeIgUserId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  return /^\d{1,30}$/.test(s) ? s : null;
}

/** Parse the IG Graph `/{ig-user-id}` payload. Null on a bad shape. */
export function parseIgUser(json: unknown): { username: string | null; followers: number; avatarUrl: string | null } | null {
  const d = json as { username?: unknown; followers_count?: unknown; profile_picture_url?: unknown } | null;
  if (!d || typeof d !== "object") return null;
  // Need at least one meaningful field (Graph errors come back as { error: {...} } → no username/count).
  if (typeof d.username !== "string" && d.followers_count == null) return null;
  return {
    username: typeof d.username === "string" ? d.username : null,
    followers: Number(d.followers_count ?? 0) || 0,
    avatarUrl: typeof d.profile_picture_url === "string" ? d.profile_picture_url : null,
  };
}

/** Parse the IG Graph `/{ig-user-id}/media` payload into post cards. Empty array on a bad shape. */
export function parseIgMedia(json: unknown): IgPost[] {
  const arr = (json as { data?: unknown })?.data;
  if (!Array.isArray(arr)) return [];
  const out: IgPost[] = [];
  for (const m of arr) {
    const md = m as { id?: unknown; caption?: unknown; permalink?: unknown; media_url?: unknown; thumbnail_url?: unknown; timestamp?: unknown };
    if (typeof md.id !== "string" || typeof md.permalink !== "string") continue;
    out.push({
      id: md.id,
      caption: typeof md.caption === "string" ? md.caption : null,
      permalink: md.permalink,
      // VIDEO items carry a thumbnail_url; IMAGE items a media_url.
      imageUrl: typeof md.media_url === "string" ? md.media_url : typeof md.thumbnail_url === "string" ? md.thumbnail_url : null,
      createdAt: typeof md.timestamp === "string" ? md.timestamp : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-tenant creds + fetch.
// ---------------------------------------------------------------------------

async function resolveIgCreds(tenantId: string | null): Promise<{ token: string; igUserId: string } | null> {
  try {
    const cfg = tenantId
      ? await prisma.integrationConfig.findFirst({ where: { tenantId }, select: { metaIgToken: true, metaIgUserId: true } })
      : await prisma.integrationConfig.findUnique({ where: { id: "default" }, select: { metaIgToken: true, metaIgUserId: true } });
    const token = decryptSecret(cfg?.metaIgToken) || process.env.META_IG_TOKEN || null;
    const igUserId = normalizeIgUserId(cfg?.metaIgUserId);
    if (token && igUserId) return { token, igUserId };
  } catch {
    /* DB hiccup — treat as not configured */
  }
  return null;
}

/** The portal's Instagram presence (follower count + latest media), or an empty/not-configured profile. */
export async function getInstagramProfile(tenantId: string | null = null): Promise<IgProfile> {
  const creds = await resolveIgCreds(tenantId);
  if (!creds) return EMPTY;
  const { token, igUserId } = creds;

  return cacheJson(`meta-ig:${tenantId ?? "_default"}:${igUserId}`, CACHE_MS, async () => {
    try {
      const ures = await httpFetch(`${GRAPH}/${igUserId}?fields=username,followers_count,profile_picture_url&access_token=${encodeURIComponent(token)}`);
      if (!ures.ok) throw new Error(`ig user ${ures.status}`);
      const user = parseIgUser(await ures.json());
      if (!user) return { ...EMPTY, configured: true };

      let posts: IgPost[] = [];
      try {
        const mres = await httpFetch(
          `${GRAPH}/${igUserId}/media?fields=caption,permalink,media_url,thumbnail_url,timestamp&limit=6&access_token=${encodeURIComponent(token)}`,
        );
        if (mres.ok) posts = parseIgMedia(await mres.json());
      } catch {
        /* media is best-effort — the profile header still shows */
      }

      return { configured: true, username: user.username, followers: user.followers, avatarUrl: user.avatarUrl, posts };
    } catch (e) {
      log.error("getInstagramProfile failed", e);
      return { ...EMPTY, configured: true };
    }
  });
}
