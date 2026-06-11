// src/lib/overlay-feeds.ts
// Registry of OBS-overlay feed producers — the single source of truth for what
// each overlay's data payload looks like. Consumed by BOTH transports:
//   • the generic SSE streamer  /api/overlay/stream/[feed]  (push), and
//   • the polled fallback routes /api/alerts/<feed>          (pull).
// A producer computes the current state; token auth + HTTP shape live in the
// callers, so producers stay pure-ish (DB/helper reads only) and identical
// across transports.
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/alerts";
import { getRumbleStatus } from "@/lib/rumble";
import { getWheelConfig } from "@/lib/wheel";
import { lockExpiredPredictions } from "@/lib/predictions";
import { displayNick } from "@/lib/utils";
import { cacheJson } from "@/lib/redis";
import { getAppAccessToken, helixGet } from "@/lib/twitch";
import { getTwitchStreamerToken } from "@/lib/platform-tokens";

export type OverlayFeedKey =
  | "goals"
  | "subathon"
  | "polls"
  | "predictions"
  | "recent-events"
  | "emoji-combo"
  | "rumble"
  | "wheel"
  | "widget"
  | "chat"
  | "viewers";

export type OverlayFeedDef = {
  /**
   * Computes the current feed payload. `params` carries the request query
   * (e.g. widget `id`); `tenantId` is resolved ONCE by the route handler from
   * the request Host and threaded through — producers must NOT call
   * currentTenantId() themselves (the SSE tick runs outside a request scope).
   * null = legacy single-tenant data.
   */
  producer: (params: URLSearchParams, tenantId: string | null) => Promise<unknown>;
  /** SSE tick + polling-fallback cadence (ms) — matched to how fast the feed changes. */
  intervalMs: number;
};

/** Collection filter: tenant rows + legacy NULL rows (pre-backfill safety). */
function tidWhere(tenantId: string | null) {
  return tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {};
}

// --- producers (logic mirrors the original /api/alerts/<x> routes verbatim) ---

async function goalsFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const [goals, hype, settings] = await Promise.all([
    prisma.streamGoal.findMany({
      where: { active: true, ...tidWhere(tid) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    tid
      ? prisma.hypeTrainState.findUnique({ where: { tenantId: tid } })
      : prisma.hypeTrainState.findUnique({ where: { id: "default" } }),
    getSettings(tid),
  ]);
  return {
    accentColor: settings.accentColor,
    goals: goals.map((g) => ({
      id: g.id,
      type: g.type,
      label: g.label,
      current: g.current,
      target: g.target,
      color: g.color,
      completedAt: g.completedAt?.toISOString() ?? null,
    })),
    hypeTrain:
      hype && hype.active
        ? {
            level: hype.level,
            goal: hype.goal,
            total: hype.total,
            topContributor: hype.topContributor,
            expiresAt: hype.expiresAt?.toISOString() ?? null,
          }
        : null,
  };
}

async function subathonFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const s = tid
    ? (await prisma.subathon.findUnique({ where: { tenantId: tid } }))
      ?? (await prisma.subathon.findUnique({ where: { id: "default" } }))
    : await prisma.subathon.findUnique({ where: { id: "default" } });
  return {
    active: s?.active ?? false,
    endsAt: s?.endsAt?.toISOString() ?? null,
    accentColor: s?.accentColor ?? "#E50914",
    label: s?.label ?? "Subathon",
    serverNow: new Date().toISOString(),
  };
}

async function pollsFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const p = await prisma.poll.findFirst({
    where: { status: "open", ...tidWhere(tid) },
    orderBy: { createdAt: "desc" },
    include: { votes: { select: { optionIndex: true } } },
  });
  if (!p) return { active: false };
  const options = p.options.map((label, idx) => ({
    label,
    count: p.votes.filter((v) => v.optionIndex === idx).length,
  }));
  return {
    active: true,
    id: p.id,
    question: p.question,
    status: p.status,
    accentColor: p.accentColor,
    total: p.votes.length,
    options,
  };
}

async function predictionsFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  await lockExpiredPredictions();
  const p = await prisma.prediction.findFirst({
    where: { status: { in: ["open", "locked"] }, ...tidWhere(tid) },
    orderBy: { opensAt: "desc" },
    include: { entries: { select: { optionIndex: true, tokensWagered: true } } },
  });
  if (!p) return { active: false };
  const options = p.options.map((label, idx) => {
    const entries = p.entries.filter((e) => e.optionIndex === idx);
    return {
      label,
      total: entries.reduce((s, e) => s + e.tokensWagered, 0),
      count: entries.length,
    };
  });
  return {
    active: true,
    id: p.id,
    question: p.question,
    status: p.status,
    accentColor: p.accentColor,
    totalPot: p.totalPot,
    options,
  };
}

// A spaced actorName is a leaked real name — show only the first token (privacy).
function safeName(name: string | null): string {
  if (!name) return "Anonim";
  return name.includes(" ") ? name.split(" ")[0] : name;
}

async function lastOf(types: string[], tid: string | null) {
  const a = await prisma.streamAlert.findFirst({
    where: { type: { in: types }, ...tidWhere(tid) },
    orderBy: { createdAt: "desc" },
    select: { actorName: true, amount: true, amountLabel: true, createdAt: true },
  });
  if (!a) return null;
  return {
    name: safeName(a.actorName),
    amount: a.amount ?? null,
    amountLabel: a.amountLabel ?? null,
    at: a.createdAt.toISOString(),
  };
}

async function recentEventsFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const [sub, donation, follow] = await Promise.all([
    lastOf(["twitch_sub", "twitch_gift_sub"], tid),
    lastOf(["donation"], tid),
    lastOf(["twitch_follow"], tid),
  ]);
  return { sub, donation, follow };
}

const COMBO_FRESH_MS = 5000;

async function emojiComboFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const s = tid
    ? await prisma.emojiComboState.findUnique({ where: { tenantId: tid } })
    : await prisma.emojiComboState.findUnique({ where: { id: "default" } });
  if (!s || !s.emoji || Date.now() - s.updatedAt.getTime() >= COMBO_FRESH_MS) {
    return { active: false };
  }
  return { active: true, emoji: s.emoji, count: s.count, ts: s.updatedAt.getTime() };
}

async function rumbleFeed(): Promise<unknown> {
  return getRumbleStatus();
}

async function wheelFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const [cfg, latest] = await Promise.all([
    getWheelConfig(tid),
    prisma.wheelSpin.findFirst({
      where: tid ? { user: { tenantId: tid } } : {},
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, displayName: true, image: true } } },
    }),
  ]);
  // Map the recorded label back to a segment index so the overlay knows where to land.
  const segmentIndex = latest ? cfg.segments.findIndex((s) => s.label === latest.segmentLabel) : -1;
  return {
    enabled: cfg.enabled,
    segments: cfg.segments.map((s) => ({ label: s.label, color: s.color, rewardTokens: s.rewardTokens })),
    latest: latest
      ? {
          id: latest.id,
          segmentIndex,
          segmentLabel: latest.segmentLabel,
          rewardTokens: latest.rewardTokens,
          actorName: displayNick(latest.user.displayName, latest.user.username),
          actorImage: latest.user.image ?? null,
          at: latest.createdAt.toISOString(),
        }
      : null,
  };
}

async function widgetFeed(params: URLSearchParams, tid: string | null): Promise<unknown> {
  const id = params.get("id");
  if (!id) return { exists: false };
  const w = await prisma.customWidget.findUnique({ where: { id } });
  // Cross-tenant guard: another tenant's widget id renders nothing here.
  if (!w || (tid && w.tenantId && w.tenantId !== tid)) return { exists: false };
  return {
    exists: true,
    text: w.text,
    accentColor: w.accentColor,
    textColor: w.textColor,
    fontSizePx: w.fontSizePx,
    fontFamily: w.fontFamily,
    position: w.position,
    showCard: w.showCard,
    bgGradient: w.bgGradient,
    bgColor1: w.bgColor1,
    bgColor2: w.bgColor2,
    bgAngle: w.bgAngle,
  };
}

const CHAT_LIMIT = 40;

function chatSafeParse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function chatFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const [rows, config] = await Promise.all([
    prisma.chatFeedMessage.findMany({ where: tidWhere(tid), orderBy: { createdAt: "desc" }, take: CHAT_LIMIT }),
    tid
      ? prisma.chatOverlayConfig.upsert({ where: { tenantId: tid }, create: { tenantId: tid }, update: {} })
      : prisma.chatOverlayConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
  ]);
  return {
    config: {
      fontSize: config.fontSize,
      textColor: config.textColor,
      fontFamily: config.fontFamily,
      bgOpacity: config.bgOpacity,
      showPlatformIcon: config.showPlatformIcon,
    },
    messages: rows
      .reverse()
      .map((m) => ({
        id: m.id,
        platform: m.platform,
        username: m.username,
        message: m.message,
        emotes: chatSafeParse(m.emotes),
        badges: chatSafeParse(m.badges),
        createdAt: m.createdAt.toISOString(),
      })),
  };
}

const VIEWERS_CACHE_MS = 12_000;

async function viewersFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  // Shared Redis cache (Upstash) so many overlay connections across serverless
  // instances don't each hammer Helix — falls back to in-process cache without Redis.
  return cacheJson<Record<string, unknown>>(`viewers:${tid ?? "default"}`, VIEWERS_CACHE_MS, async () => {
    const streamer = await getTwitchStreamerToken(tid);
    if (!streamer?.broadcasterId) return { live: false, configured: false };
    try {
      const appToken = await getAppAccessToken();
      const data = await helixGet<{ data: Array<{ viewer_count: number; game_name: string | null }> }>(
        `/streams?user_id=${streamer.broadcasterId}`,
        appToken,
      );
      const s = data.data[0];
      return s
        ? { live: true, configured: true, viewers: s.viewer_count, game: s.game_name ?? null }
        : { live: false, configured: true };
    } catch {
      return { live: false, configured: true, error: true };
    }
  });
}

export const OVERLAY_FEEDS: Record<OverlayFeedKey, OverlayFeedDef> = {
  goals: { producer: goalsFeed, intervalMs: 2000 },
  subathon: { producer: subathonFeed, intervalMs: 3000 },
  polls: { producer: pollsFeed, intervalMs: 4000 },
  predictions: { producer: predictionsFeed, intervalMs: 4000 },
  "recent-events": { producer: recentEventsFeed, intervalMs: 5000 },
  "emoji-combo": { producer: emojiComboFeed, intervalMs: 1500 },
  rumble: { producer: rumbleFeed, intervalMs: 15000 },
  wheel: { producer: wheelFeed, intervalMs: 2000 },
  widget: { producer: widgetFeed, intervalMs: 8000 },
  chat: { producer: chatFeed, intervalMs: 2000 },
  viewers: { producer: viewersFeed, intervalMs: 20000 },
};

/** Look up a feed definition by key (null for an unknown key). */
export function getOverlayFeed(key: string): OverlayFeedDef | null {
  return Object.hasOwn(OVERLAY_FEEDS, key) ? OVERLAY_FEEDS[key as OverlayFeedKey] : null;
}
