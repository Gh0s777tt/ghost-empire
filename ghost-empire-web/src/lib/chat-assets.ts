// src/lib/chat-assets.ts
// Server-side fetch + in-process cache of chat rendering assets for the OBS chat
// overlay:
//   • Twitch badge images (global + this channel) — Helix /chat/badges*
//   • Third-party emotes (7TV, BTTV, FrankerFaceZ) — channel + global sets
// Both change rarely, so they're cached with generous TTLs to avoid hammering
// external APIs on every overlay poll. All fetches fail soft (return what we have)
// so a flaky third-party API never breaks the chat overlay.
import { prisma } from "@/lib/prisma";
import { getAppAccessToken, helixGet } from "@/lib/twitch";
import type { ChatAssets, ChatBadges, ThirdPartyEmotes } from "@/components/ChatMessageRow";

const BADGE_TTL_MS = 60 * 60_000; // 1h — badge art basically never changes
const EMOTE_TTL_MS = 10 * 60_000; // 10min — streamers add/remove emotes occasionally

let badgeCache: { at: number; data: ChatBadges } | null = null;
let emoteCache: { at: number; data: ThirdPartyEmotes } | null = null;

async function getBroadcasterId(): Promise<string | null> {
  const tok = await prisma.twitchStreamerToken.findUnique({ where: { id: "default" } });
  return tok?.broadcasterId ?? null;
}

// ---------------------------------------------------------------------------
// Twitch badges — Helix returns { data: [{ set_id, versions: [{ id, image_url_* }] }] }
// ---------------------------------------------------------------------------
type HelixBadgeResp = {
  data: Array<{ set_id: string; versions: Array<{ id: string; image_url_2x: string; image_url_4x: string }> }>;
};

async function fetchTwitchBadges(broadcasterId: string | null): Promise<ChatBadges> {
  const out: ChatBadges = {};
  let appToken: string;
  try {
    appToken = await getAppAccessToken();
  } catch {
    return out;
  }
  const paths = ["/chat/badges/global"];
  if (broadcasterId) paths.push(`/chat/badges?broadcaster_id=${broadcasterId}`);
  for (const path of paths) {
    try {
      const resp = await helixGet<HelixBadgeResp>(path, appToken);
      for (const set of resp.data ?? []) {
        for (const v of set.versions ?? []) {
          // Channel badges (fetched second) intentionally override global versions.
          out[`${set.set_id}/${v.id}`] = v.image_url_2x || v.image_url_4x;
        }
      }
    } catch {
      /* skip this source — keep whatever we already gathered */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Third-party emotes — 7TV, BTTV, FFZ. Each maps an emote NAME to an image URL.
// Channel sets are loaded after globals so a channel override wins on name clash.
// ---------------------------------------------------------------------------
async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function add7tv(emotes: any[] | undefined, out: ThirdPartyEmotes): void {
  for (const e of emotes ?? []) {
    const name: string | undefined = e?.name;
    const id: string | undefined = e?.id ?? e?.data?.id;
    if (!name || !id) continue;
    out[name] = {
      url: `https://cdn.7tv.app/emote/${id}/2x.webp`,
      zeroWidth: ((e?.flags ?? 0) & 256) === 256, // 7TV ZERO_WIDTH flag
    };
  }
}

function addBttv(emotes: any[] | undefined, out: ThirdPartyEmotes): void {
  for (const e of emotes ?? []) {
    const name: string | undefined = e?.code;
    const id: string | undefined = e?.id;
    if (!name || !id) continue;
    out[name] = { url: `https://cdn.betterttv.net/emote/${id}/2x.webp` };
  }
}

function addFfz(sets: Record<string, any> | undefined, out: ThirdPartyEmotes): void {
  for (const set of Object.values(sets ?? {})) {
    for (const e of (set as any)?.emoticons ?? []) {
      const name: string | undefined = e?.name;
      const urls = e?.urls ?? {};
      const raw: string | undefined = urls["2"] || urls["1"] || urls["4"];
      if (!name || !raw) continue;
      out[name] = { url: raw.startsWith("//") ? `https:${raw}` : raw };
    }
  }
}

async function fetchThirdPartyEmotes(broadcasterId: string | null): Promise<ThirdPartyEmotes> {
  const out: ThirdPartyEmotes = {};

  // Globals first (channel overrides them below).
  const [sevenGlobal, bttvGlobal, ffzGlobal] = await Promise.all([
    getJson("https://7tv.io/v3/emote-sets/global"),
    getJson("https://api.betterttv.net/3/cached/emotes/global"),
    getJson("https://api.frankerfacez.com/v1/set/global"),
  ]);
  add7tv(sevenGlobal?.emotes, out);
  addBttv(Array.isArray(bttvGlobal) ? bttvGlobal : [], out);
  addFfz(ffzGlobal?.sets, out);

  // Channel sets (only when we know the broadcaster's Twitch id).
  if (broadcasterId) {
    const [seven, bttv, ffz] = await Promise.all([
      getJson(`https://7tv.io/v3/users/twitch/${broadcasterId}`),
      getJson(`https://api.betterttv.net/3/cached/users/twitch/${broadcasterId}`),
      getJson(`https://api.frankerfacez.com/v1/room/id/${broadcasterId}`),
    ]);
    add7tv(seven?.emote_set?.emotes, out);
    if (bttv) {
      addBttv(bttv.channelEmotes, out);
      addBttv(bttv.sharedEmotes, out);
    }
    addFfz(ffz?.sets, out);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public — cached combined assets for the overlay
// ---------------------------------------------------------------------------
export async function getChatAssets(): Promise<ChatAssets> {
  const broadcasterId = await getBroadcasterId();
  const now = Date.now();

  if (!badgeCache || now - badgeCache.at > BADGE_TTL_MS) {
    badgeCache = { at: now, data: await fetchTwitchBadges(broadcasterId) };
  }
  if (!emoteCache || now - emoteCache.at > EMOTE_TTL_MS) {
    emoteCache = { at: now, data: await fetchThirdPartyEmotes(broadcasterId) };
  }

  return { badges: badgeCache.data, emotes: emoteCache.data };
}
