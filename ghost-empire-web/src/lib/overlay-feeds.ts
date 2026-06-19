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
import { companionStage } from "@/lib/companion";
import { isWarLive } from "@/lib/clan-wars";
import { cacheJson } from "@/lib/redis";
import { getLiveStatus } from "@/lib/live-status";
import QRCode from "qrcode";
import { cryptoUri, sepaQrPayload } from "@/lib/payment-methods";

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
  | "viewers"
  | "companion"
  | "clan"
  | "clan-war"
  | "support-qr"
  | "support-goal"
  | "trivia";

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
      textColor: g.textColor,
      bgColor: g.bgColor,
      fontFamily: g.fontFamily,
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
            color: settings.hypeColor,
            bgColor: settings.hypeBgColor,
            fontFamily: settings.hypeFontFamily,
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
    select: { id: true, question: true, status: true, accentColor: true, options: true },
  });
  if (!p) return { active: false };
  // Aggregate vote counts in the DB instead of loading every PollVote row each
  // tick (a popular poll could pull thousands of rows just to count them).
  const grouped = await prisma.pollVote.groupBy({
    by: ["optionIndex"],
    where: { pollId: p.id },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g.optionIndex, g._count._all]));
  const options = p.options.map((label, idx) => ({ label, count: counts.get(idx) ?? 0 }));
  return {
    active: true,
    id: p.id,
    question: p.question,
    status: p.status,
    accentColor: p.accentColor,
    total: options.reduce((s, o) => s + o.count, 0),
    options,
  };
}

async function predictionsFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  await lockExpiredPredictions(tid); // pass the request-scoped tenant — the tick runs outside request scope
  const p = await prisma.prediction.findFirst({
    where: { status: { in: ["open", "locked"] }, ...tidWhere(tid) },
    orderBy: { opensAt: "desc" },
    select: { id: true, question: true, status: true, accentColor: true, totalPot: true, options: true },
  });
  if (!p) return { active: false };
  // Sum/count wagers per option in the DB instead of pulling every entry row.
  const grouped = await prisma.predictionEntry.groupBy({
    by: ["optionIndex"],
    where: { predictionId: p.id },
    _sum: { tokensWagered: true },
    _count: { _all: true },
  });
  const byIdx = new Map(grouped.map((g) => [g.optionIndex, g]));
  const options = p.options.map((label, idx) => {
    const g = byIdx.get(idx);
    return { label, total: g?._sum.tokensWagered ?? 0, count: g?._count._all ?? 0 };
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
    posXPct: w.posXPct,
    posYPct: w.posYPct,
    scalePct: w.scalePct,
  };
}

const CHAT_LIMIT = 40;

// Mirrors the ChatOverlayConfig schema defaults — used when no config row exists
// yet, so the read-first producer never has to create one on a hot SSE tick.
const CHAT_OVERLAY_DEFAULTS = {
  fontSize: 15,
  textColor: "#e4e4e7",
  fontFamily: "Inter",
  bgOpacity: 0.85,
  showPlatformIcon: true,
} as const;

function chatSafeParse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function chatFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  // Read-FIRST: this producer runs every ~2s per OBS chat source. The old
  // unconditional upsert was a WRITE every tick — fall back to defaults when the
  // row doesn't exist yet (the admin save path creates it).
  const [rows, configRow] = await Promise.all([
    prisma.chatFeedMessage.findMany({ where: tidWhere(tid), orderBy: { createdAt: "desc" }, take: CHAT_LIMIT }),
    tid
      ? prisma.chatOverlayConfig.findUnique({ where: { tenantId: tid } })
      : prisma.chatOverlayConfig.findUnique({ where: { id: "default" } }),
  ]);
  const config = configRow ?? CHAT_OVERLAY_DEFAULTS;
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

async function viewersFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  // Twitch live status (viewers/game) — shared with the public "LIVE now" home
  // banner via lib/live-status (one cached Helix call per tenant for both).
  return getLiveStatus(tid);
}

// Champion Companion: the top pet by xp in the tenant — shown on stream to drive
// the feeding sink (feed yours to claim the spotlight).
async function companionFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const c = await prisma.companion.findFirst({
    where: { ...tidWhere(tid), xp: { gt: 0 } },
    orderBy: { xp: "desc" },
    select: { name: true, xp: true, user: { select: { displayName: true, username: true } } },
  });
  if (!c) return { exists: false };
  return { exists: true, name: c.name, xp: c.xp, owner: displayNick(c.user.displayName, c.user.username), emoji: companionStage(c.xp).emoji };
}

// Champion Clan: the richest clan by treasury in the tenant — shown on stream to
// drive contributions (pour GT in to put your clan in the spotlight).
async function clanFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const c = await prisma.clan.findFirst({
    where: { ...tidWhere(tid), treasury: { gt: 0 } },
    orderBy: { treasury: "desc" },
    select: { name: true, tag: true, treasury: true, _count: { select: { members: true } } },
  });
  if (!c) return { exists: false };
  return { exists: true, name: c.name, tag: c.tag, treasury: c.treasury, members: c._count.members };
}

// Live Clan War: the active war's standings (top clans by warPoints) — shown on
// stream so viewers see the race in real time and pour GT in for their clan.
async function clanWarFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const war = await prisma.clanWar.findFirst({
    where: { status: "active", ...(tid ? { tenantId: tid } : {}) },
    orderBy: { startsAt: "desc" },
    select: { name: true, status: true, endsAt: true, prizePool: true },
  });
  if (!war || !isWarLive(war, Date.now())) return { active: false };
  const standings = await prisma.clan.findMany({
    where: { ...tidWhere(tid), warPoints: { gt: 0 } },
    orderBy: { warPoints: "desc" },
    take: 5,
    select: { tag: true, name: true, warPoints: true },
  });
  return {
    active: true,
    name: war.name,
    endsAt: war.endsAt.toISOString(),
    prizePool: war.prizePool,
    standings: standings.map((c) => ({ tag: c.tag, name: c.name, points: c.warPoints })),
  };
}

// Support-QR carousel: the tenant's active real-money methods (#514) as scannable
// QR codes, one rotated on screen at a time (rotation is client-side). QRs are
// generated server-side here and cached via shared() — they only change when the
// streamer edits a method, so a long interval is fine.
async function supportQrFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const methods = await prisma.paymentMethod
    .findMany({ where: { active: true, ...tidWhere(tid) }, orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] })
    .catch(() => []);
  const items = await Promise.all(
    methods.map(async (m) => {
      const data =
        m.kind === "crypto" ? cryptoUri(m.network, m.value)
        : m.kind === "bank" ? sepaQrPayload(m.network ?? "", m.value)
        : m.value;
      let qr: string | null = null;
      try {
        qr = await QRCode.toDataURL(data, { margin: 1, width: 420, color: { dark: "#0a0a0a", light: "#ffffff" } });
      } catch { /* skip an un-encodable value */ }
      return { kind: m.kind, label: m.label, network: m.network, icon: m.icon, qr };
    }),
  );
  return { items: items.filter((i) => i.qr) };
}

// Support fundraising goal (#519) as a live OBS progress bar (#528). The streamer
// bumps `current` in /admin#payments and it animates on stream — the donatr.ee /
// Streamlabs "donation goal" widget. Reads the same active SupportGoal the
// /support page shows (per-tenant; SupportGoal.tenantId is unique).
async function supportGoalFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const goal = await (tid
    ? prisma.supportGoal.findUnique({ where: { tenantId: tid } })
    : prisma.supportGoal.findFirst()
  ).catch(() => null);
  if (!goal?.active || goal.target <= 0) return { active: false };
  const pct = Math.max(0, Math.min(100, Math.round((goal.current / goal.target) * 100)));
  return { active: true, title: goal.title, target: goal.target, current: goal.current, currency: goal.currency, pct };
}

// Live trivia round (#524): the question the streamer put live, with answer counts
// per option + a countdown. The correct answer is revealed only AFTER liveEndsAt.
async function triviaFeed(_p: URLSearchParams, tid: string | null): Promise<unknown> {
  const q = await prisma.triviaQuestion.findFirst({ where: { live: true, ...tidWhere(tid) }, orderBy: { createdAt: "desc" } });
  if (!q) return { active: false };
  const grouped = await prisma.triviaAnswer.groupBy({ by: ["optionIndex"], where: { questionId: q.id }, _count: { _all: true } });
  const counts = new Map(grouped.map((g) => [g.optionIndex, g._count._all]));
  const ended = q.liveEndsAt ? q.liveEndsAt.getTime() <= Date.now() : false;
  return {
    active: true,
    question: q.question,
    reward: q.reward,
    options: q.options.map((label, i) => ({ label, count: counts.get(i) ?? 0 })),
    total: q.options.reduce((s, _l, i) => s + (counts.get(i) ?? 0), 0),
    endsAt: q.liveEndsAt?.toISOString() ?? null,
    correctIndex: ended ? q.correctIndex : null, // only reveal after the timer
  };
}

/**
 * Wrap a producer so that all OBS connections to the SAME feed+tenant share ONE
 * execution per tick instead of each running its own DB query loop. TTL =
 * intervalMs (the feed's own cadence), so a single connection still sees fresh
 * data every tick — only the redundant concurrent reads collapse. Keyed by
 * params too (the widget feed varies by `id`). Shared via Upstash across
 * serverless instances; in-process fallback without Redis.
 */
function shared(key: OverlayFeedKey, def: OverlayFeedDef): OverlayFeedDef {
  return {
    intervalMs: def.intervalMs,
    producer: (params, tid) =>
      cacheJson(`ovl:${key}:${tid ?? "default"}:${params.toString()}`, def.intervalMs, () => def.producer(params, tid)),
  };
}

export const OVERLAY_FEEDS: Record<OverlayFeedKey, OverlayFeedDef> = {
  goals: shared("goals", { producer: goalsFeed, intervalMs: 2000 }),
  subathon: shared("subathon", { producer: subathonFeed, intervalMs: 3000 }),
  polls: shared("polls", { producer: pollsFeed, intervalMs: 4000 }),
  predictions: shared("predictions", { producer: predictionsFeed, intervalMs: 4000 }),
  "recent-events": shared("recent-events", { producer: recentEventsFeed, intervalMs: 5000 }),
  "emoji-combo": shared("emoji-combo", { producer: emojiComboFeed, intervalMs: 1500 }),
  rumble: shared("rumble", { producer: rumbleFeed, intervalMs: 15000 }),
  wheel: shared("wheel", { producer: wheelFeed, intervalMs: 2000 }),
  widget: shared("widget", { producer: widgetFeed, intervalMs: 8000 }),
  chat: shared("chat", { producer: chatFeed, intervalMs: 2000 }),
  companion: shared("companion", { producer: companionFeed, intervalMs: 8000 }),
  clan: shared("clan", { producer: clanFeed, intervalMs: 10000 }),
  "clan-war": shared("clan-war", { producer: clanWarFeed, intervalMs: 5000 }),
  "support-qr": shared("support-qr", { producer: supportQrFeed, intervalMs: 30000 }), // QRs are static — refresh slowly
  "support-goal": shared("support-goal", { producer: supportGoalFeed, intervalMs: 5000 }), // bumped manually — 5s feels live
  trivia: shared("trivia", { producer: triviaFeed, intervalMs: 2000 }),
  viewers: { producer: viewersFeed, intervalMs: 20000 }, // already internally cached (Helix)
};

/** Look up a feed definition by key (null for an unknown key). */
export function getOverlayFeed(key: string): OverlayFeedDef | null {
  return Object.hasOwn(OVERLAY_FEEDS, key) ? OVERLAY_FEEDS[key as OverlayFeedKey] : null;
}
