// src/app/api/webhooks/twitch-eventsub/route.ts
// Twitch EventSub webhook handler.
// Three message types we receive:
//   - "webhook_callback_verification" — challenge to confirm endpoint ownership
//   - "notification" — actual event payload
//   - "revocation" — Twitch tells us they removed a subscription
import { NextResponse, after } from "next/server";
import { notifyStreamLive } from "@/lib/web-push";
import { prisma } from "@/lib/prisma";
import { verifyEventSubSignature, isMessageFresh } from "@/lib/twitch";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals, setHypeTrainStart, setHypeTrainProgress, setHypeTrainEnded } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { tenantIdForTwitchBroadcaster } from "@/lib/platform-tokens";
import { currentTenantId } from "@/lib/tenant";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";
import { createLogger } from "@/lib/logger";

const log = createLogger("twitch-eventsub");

// Tunable token rewards (env-configurable later if needed)
const REWARD_SUB_T1 = 5000;
const REWARD_SUB_T2 = 10000;
const REWARD_SUB_T3 = 25000;
const REWARD_SUB_PRIME = 3000;
const REWARD_GIFTSUB_PER_SUB = 5000;
const REWARD_BITS_MULTIPLIER = 10; // 1 bit = 10 GT

function subRewardForTier(tier: string): number {
  switch (tier) {
    case "1000": return REWARD_SUB_T1;
    case "2000": return REWARD_SUB_T2;
    case "3000": return REWARD_SUB_T3;
    default: return REWARD_SUB_T1;
  }
}

function tierLabel(tier: string): string {
  return tier === "2000" ? "T2" : tier === "3000" ? "T3" : "T1";
}

export async function POST(req: Request) {
  const messageId = req.headers.get("twitch-eventsub-message-id");
  const timestamp = req.headers.get("twitch-eventsub-message-timestamp");
  const signature = req.headers.get("twitch-eventsub-message-signature");
  const messageType = req.headers.get("twitch-eventsub-message-type");

  if (!messageId || !timestamp || !signature || !messageType) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  const body = await req.text();

  // Signature verification (CRITICAL — prevents spoofed events)
  if (!verifyEventSubSignature(messageId, timestamp, body, signature)) {
    log.warn("invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // Replay protection
  if (!isMessageFresh(timestamp)) {
    log.warn("stale message timestamp");
    return NextResponse.json({ error: "Stale message" }, { status: 403 });
  }

  let parsed: {
    challenge?: string;
    subscription?: { id: string; type: string; status: string };
    event?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // === Challenge verification ===
  if (messageType === "webhook_callback_verification" && parsed.challenge) {
    log.info("challenge accepted", { subscriptionId: parsed.subscription?.id });
    return new Response(parsed.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // === Revocation ===
  if (messageType === "revocation") {
    log.warn("subscription revoked", { subscription: parsed.subscription });
    if (parsed.subscription) {
      await prisma.twitchEventSubscription.update({
        where: { id: parsed.subscription.id },
        data: { status: parsed.subscription.status ?? "revoked" },
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // === Notification (actual event) ===
  if (messageType !== "notification") {
    return NextResponse.json({ ok: true, ignored: messageType });
  }

  const eventType = parsed.subscription?.type;
  const event = parsed.event;
  if (!eventType || !event) {
    return NextResponse.json({ error: "Missing event data" }, { status: 400 });
  }

  // Idempotency LOCK — insert the dedup row BEFORE running any grant handler. The unique
  // on `eventId` makes a concurrent or retried delivery of the same message lose with
  // P2002, so two parallel deliveries can never both reach the token grants below. (The
  // audit fields userId/tokensGranted are backfilled with an UPDATE once we know them.)
  try {
    await prisma.twitchEvent.create({
      data: {
        eventId: messageId,
        type: eventType,
        payload: JSON.stringify(event).slice(0, 5000),
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  // Tenant of the channel this event belongs to: the event's broadcaster id maps
  // to the streamer-token row (#416). Fallback = Host-resolved (single-tenant).
  // Resolved BEFORE the ACK because `currentTenantId()` reads the request Host —
  // the rest of the work below runs in the background where request scope is gone.
  const broadcasterId = String(event.broadcaster_user_id ?? "");
  const tenantId =
    (broadcasterId ? await tenantIdForTwitchBroadcaster(broadcasterId) : null)
    ?? (await currentTenantId());
  const subscriptionId = parsed.subscription?.id ?? null;

  // ACK-FIRST (#perf): the idempotency row is already committed (a retry now loses
  // with P2002), and signature/freshness are verified — everything above gates the
  // ACK. The grant handlers + achievement/XP fan-out are the slow part on a busy
  // stream (hype-train progress storms, gift-sub bursts) and our DB pool is only 3,
  // so we run them AFTER the response via `after()`. Twitch disables a subscription
  // whose endpoint is consistently slow to 2xx, so returning fast is what keeps the
  // integration alive; the background work still runs to completion (waitUntil).
  after(async () => {
    try {
      // Update lastSeenAt on subscription
      if (subscriptionId) {
        await prisma.twitchEventSubscription
          .update({ where: { id: subscriptionId }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }

      // Run grant handlers; matchedUserId/tokensGranted are backfilled into the dedup row after.
      let matchedUserId: string | null = null;
      let tokensGranted: number | null = null;

      try {
        if (eventType === "channel.subscribe") {
          const result = await handleSubscribe(event, tenantId);
          matchedUserId = result.userId;
          tokensGranted = result.tokens;
        } else if (eventType === "channel.subscription.gift") {
          const result = await handleGiftSub(event, tenantId);
          matchedUserId = result.userId;
          tokensGranted = result.tokens;
        } else if (eventType === "channel.cheer") {
          const result = await handleCheer(event, tenantId);
          matchedUserId = result.userId;
          tokensGranted = result.tokens;
        } else if (eventType === "channel.hype_train.begin") {
          await handleHypeTrainBegin(event, tenantId);
        } else if (eventType === "channel.hype_train.progress") {
          await handleHypeTrainProgress(event, tenantId);
        } else if (eventType === "channel.hype_train.end") {
          await handleHypeTrainEnd(event, tenantId);
        } else if (eventType === "stream.online") {
          await handleStreamOnline(event, tenantId);
        } else if (eventType === "stream.offline") {
          await handleStreamOffline();
        } else if (eventType === "channel.follow") {
          await handleFollow(event, tenantId);
        } else {
          log.info("unhandled event type", { eventType });
        }
      } catch (e) {
        log.error("handler error", e, { eventType });
      }

      // Backfill audit fields now that the handlers have resolved the matched user + grant.
      if (matchedUserId !== null || tokensGranted !== null) {
        await prisma.twitchEvent
          .update({ where: { eventId: messageId }, data: { userId: matchedUserId, tokensGranted } })
          .catch(() => {});
      }

      // Fire achievement checks + season XP AFTER persisting the event so count queries see it
      if (matchedUserId) {
        if (eventType === "channel.subscribe") {
          await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "twitch_sub_received" });
          await awardSeasonXp(matchedUserId, "twitch_sub");
        } else if (eventType === "channel.subscription.gift") {
          await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "gift_subs_given" });
          const giftTotal = (event.total as number) ?? 1;
          await awardSeasonXp(matchedUserId, "gift_sub_each", giftTotal);
        } else if (eventType === "channel.cheer") {
          await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "bits_cheered" });
          const cheerBits = (event.bits as number) ?? 0;
          await awardSeasonXp(matchedUserId, "bit_each", cheerBits);
        }
      }
    } catch (e) {
      log.error("background processing error", e, { eventType });
    }
  });

  return NextResponse.json({ ok: true });
}

// === Handlers ===

// New follower → store a `twitch_follow` StreamAlert directly (bypassing the
// enabled-type filter in dispatchAlert) so the "last follower" widget always has
// data. Not shown as an overlay popup unless `twitch_follow` is enabled.
async function handleFollow(event: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const userName = (event.user_name as string) || (event.user_login as string) || "Anonim";
  await prisma.streamAlert.create({
    data: {
      ...(tenantId ? { tenantId } : {}),
      type: "twitch_follow",
      title: "⭐ Nowy follow!",
      message: "zaobserwował kanał",
      icon: "⭐",
      actorName: userName,
    },
  });
  log.info("new follower", { userName });
}

async function handleSubscribe(event: Record<string, unknown>, tenantId: string | null): Promise<{ userId: string | null; tokens: number | null }> {
  const userLogin = (event.user_login as string)?.toLowerCase();
  const userName = event.user_name as string | undefined;
  const tier = (event.tier as string) ?? "1000";
  const isGift = event.is_gift as boolean | undefined;

  // Skip gifted subs here — they're handled by the gifter's `channel.subscription.gift` event
  if (isGift) {
    log.info("subscribe ignored (gifted sub)", { userLogin });
    return { userId: null, tokens: null };
  }

  if (!userLogin) return { userId: null, tokens: null };

  // Stream alert fires for every sub, even when the subscriber has no Ghost Empire account
  await dispatchAlertSafe({
    type: "twitch_sub",
    title: `💜 Nowy sub ${tierLabel(tier)}!`,
    message: "zasubował kanał",
    icon: "💜",
    actorName: userName ?? userLogin,
  }, tenantId);

  // Bump any active "subs" stream goals
  await incrementGoals("subs", 1, tenantId);
  void extendSubathon({ subs: 1 }, tenantId).catch(() => {});

  // Find Ghost Empire user via Connection.username on Twitch
  const connection = await prisma.connection.findFirst({
    where: { platform: "twitch", username: { equals: userLogin, mode: "insensitive" } },
    select: { userId: true, id: true },
  });
  if (!connection) {
    log.info("sub from unlinked account", { userLogin });
    return { userId: null, tokens: null };
  }

  const tokens = subRewardForTier(tier);

  await prisma.$transaction([
    prisma.connection.update({
      where: { id: connection.id },
      data: {
        isSubscriber: true,
        subTier: tierLabel(tier),
        subStartDate: new Date(),
        // subMonths handled by subscription.message event if we want cumulative
      },
    }),
    prisma.user.update({
      where: { id: connection.userId },
      data: {
        tokens: { increment: tokens },
        totalEarned: { increment: tokens },
      },
    }),
    prisma.transaction.create({
      data: {
        userId: connection.userId,
        type: "earn",
        amount: tokens,
        reason: `twitch_sub:${tierLabel(tier)}`,
        status: "completed",
      },
    }),
    prisma.notification.create({
      data: {
        userId: connection.userId,
        type: "system",
        title: `🎉 Dziękujemy za sub ${tierLabel(tier)}!`,
        message: `Otrzymałeś ${tokens.toLocaleString("pl-PL")} GT za subskrypcję Twitch. Welcome do crewu!`,
        icon: "💜",
      },
    }),
  ]);

  return { userId: connection.userId, tokens };
}

async function handleGiftSub(event: Record<string, unknown>, tenantId: string | null): Promise<{ userId: string | null; tokens: number | null }> {
  const gifterLogin = (event.user_login as string)?.toLowerCase();
  const gifterName = event.user_name as string | undefined;
  const isAnonymous = event.is_anonymous as boolean | undefined;
  const total = (event.total as number) ?? 1;
  const tier = (event.tier as string) ?? "1000";

  // Stream alert fires for every gift sub, including anonymous + non-Ghost-Empire users
  await dispatchAlertSafe({
    type: "twitch_gift_sub",
    title: `🎁 Gifted ${total} sub${total === 1 ? "" : "y"} ${tierLabel(tier)}!`,
    message: "rozdał suby community",
    icon: "🎁",
    actorName: isAnonymous ? "Anonymous Gifter" : (gifterName ?? gifterLogin ?? "Anon"),
    amount: total,
    amountLabel: "sub" + (total === 1 ? "" : "y"),
  }, tenantId);

  // Bump goals — both gift_subs (count) and subs (because each gift = a sub for someone)
  await incrementGoals("gift_subs", total, tenantId);
  await incrementGoals("subs", total, tenantId);
  void extendSubathon({ subs: total }, tenantId).catch(() => {});

  if (isAnonymous || !gifterLogin) {
    log.info("anonymous gift sub — no reward");
    return { userId: null, tokens: null };
  }

  const connection = await prisma.connection.findFirst({
    where: { platform: "twitch", username: { equals: gifterLogin, mode: "insensitive" } },
    select: { userId: true },
  });
  if (!connection) return { userId: null, tokens: null };

  // Multiplier for tier (T2 = 3×, T3 = 10×)
  const tierMultiplier = tier === "2000" ? 3 : tier === "3000" ? 10 : 1;
  const tokens = REWARD_GIFTSUB_PER_SUB * total * tierMultiplier;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: connection.userId },
      data: {
        tokens: { increment: tokens },
        totalEarned: { increment: tokens },
      },
    }),
    prisma.transaction.create({
      data: {
        userId: connection.userId,
        type: "earn",
        amount: tokens,
        reason: `twitch_gift_sub:${total}x${tierLabel(tier)}`,
        status: "completed",
      },
    }),
    prisma.notification.create({
      data: {
        userId: connection.userId,
        type: "system",
        title: `🎁 Dziękujemy za ${total} gifted sub${total === 1 ? "" : "y"} ${tierLabel(tier)}!`,
        message: `Otrzymałeś ${tokens.toLocaleString("pl-PL")} GT za hojność.`,
        icon: "🎁",
      },
    }),
  ]);

  return { userId: connection.userId, tokens };
}

async function handleCheer(event: Record<string, unknown>, tenantId: string | null): Promise<{ userId: string | null; tokens: number | null }> {
  const userLogin = (event.user_login as string)?.toLowerCase();
  const userName = event.user_name as string | undefined;
  const isAnonymous = event.is_anonymous as boolean | undefined;
  const bits = (event.bits as number) ?? 0;

  // Stream alert fires for every cheer (including anonymous and non-Ghost-Empire users)
  if (bits > 0) {
    await dispatchAlertSafe({
      type: "twitch_cheer",
      title: `💎 Cheer ${bits.toLocaleString("pl-PL")} bits!`,
      message: "wsparł bitami",
      icon: "💎",
      actorName: isAnonymous ? "Anonymous Cheerer" : (userName ?? userLogin ?? "Anon"),
      amount: bits,
      amountLabel: "bits",
    }, tenantId);
    await incrementGoals("cheers_bits", bits, tenantId);
  }

  if (isAnonymous || !userLogin || bits <= 0) {
    return { userId: null, tokens: null };
  }

  const connection = await prisma.connection.findFirst({
    where: { platform: "twitch", username: { equals: userLogin, mode: "insensitive" } },
    select: { userId: true, id: true, bits: true },
  });
  if (!connection) return { userId: null, tokens: null };

  const tokens = bits * REWARD_BITS_MULTIPLIER;

  await prisma.$transaction([
    prisma.connection.update({
      where: { id: connection.id },
      data: {
        bits: { increment: bits },
      },
    }),
    prisma.user.update({
      where: { id: connection.userId },
      data: {
        tokens: { increment: tokens },
        totalEarned: { increment: tokens },
      },
    }),
    prisma.transaction.create({
      data: {
        userId: connection.userId,
        type: "earn",
        amount: tokens,
        reason: `twitch_cheer:${bits}bits`,
        status: "completed",
      },
    }),
    prisma.notification.create({
      data: {
        userId: connection.userId,
        type: "system",
        title: `💎 Cheer ${bits} bits!`,
        message: `Otrzymałeś ${tokens.toLocaleString("pl-PL")} GT (1 bit = ${REWARD_BITS_MULTIPLIER} GT).`,
        icon: "💎",
      },
    }),
  ]);

  return { userId: connection.userId, tokens };
}

// =====================================================
// Hype Train handlers
// =====================================================

async function handleHypeTrainBegin(event: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const total = (event.total as number) ?? 0;
  const progress = (event.progress as number) ?? 0;
  const goal = (event.goal as number) ?? 0;
  const level = (event.level as number) ?? 1;
  const expiresAt = parseDate(event.expires_at as string | undefined);

  await setHypeTrainStart({
    level,
    goal: goal || progress + 100,  // fallback if API doesn't return goal
    total,
    expiresAt: expiresAt ?? new Date(Date.now() + 5 * 60_000),
  }, tenantId);

  await dispatchAlertSafe({
    type: "twitch_cheer",  // reuse cheer alert visual
    title: `🚂 HYPE TRAIN STARTED! (Level ${level})`,
    message: `wszystkie suby/bity teraz nakręcają hype train`,
    icon: "🚂",
    amount: level,
    amountLabel: "level",
  }, tenantId);
}

async function handleHypeTrainProgress(event: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const total = (event.total as number) ?? 0;
  const progress = (event.progress as number) ?? 0;
  const goal = (event.goal as number) ?? 0;
  const level = (event.level as number) ?? 1;
  const expiresAt = parseDate(event.expires_at as string | undefined);

  // top_contributions is an array; pick the highest
  const topContribs = event.top_contributions as Array<{ user_name?: string; total?: number; type?: string }> | undefined;
  const topContributor = topContribs?.sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0]?.user_name ?? null;

  await setHypeTrainProgress({
    level,
    goal: goal || progress + 100,
    total,
    topContributor,
    expiresAt: expiresAt ?? new Date(Date.now() + 5 * 60_000),
  }, tenantId);
}

async function handleHypeTrainEnd(event: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const level = (event.level as number) ?? 1;
  const total = (event.total as number) ?? 0;

  await setHypeTrainEnded(tenantId);

  await dispatchAlertSafe({
    type: "twitch_cheer",
    title: `🚂 HYPE TRAIN ENDED — Level ${level}!`,
    message: "świetna jazda community!",
    icon: "🏁",
    amount: total,
    amountLabel: "pkt",
  }, tenantId);
}

// =====================================================
// Stream sessions ("czas na streamie" — per-stream analytics)
// =====================================================

/** Close any session left open (e.g. a missed stream.offline), computing duration. */
async function closeOpenStreamSessions(endedAt: Date): Promise<void> {
  const open = await prisma.streamSession.findMany({ where: { platform: "twitch", endedAt: null } });
  for (const s of open) {
    const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - s.startedAt.getTime()) / 1000));
    await prisma.streamSession.update({ where: { id: s.id }, data: { endedAt, durationSeconds } });
  }
}

async function handleStreamOnline(event: Record<string, unknown>, tenantId: string | null): Promise<void> {
  const streamId = (event.id as string | undefined) ?? null;
  const startedAt = parseDate(event.started_at as string | undefined) ?? new Date();
  // Idempotent — Twitch may redeliver the same stream.online.
  if (streamId) {
    const existing = await prisma.streamSession.findUnique({ where: { twitchStreamId: streamId } });
    if (existing) return;
  }
  // Safety net: close anything left open by a missed stream.offline before opening a new one.
  await closeOpenStreamSessions(startedAt);
  await prisma.streamSession.create({ data: { platform: "twitch", twitchStreamId: streamId, startedAt } });
  log.info("stream online", { streamId, startedAt: startedAt.toISOString() });
  // Fire the "LIVE now" web push exactly once per stream (we're past the idempotency
  // guard). Fire-and-forget: the EventSub webhook must return a fast 2xx to Twitch, so
  // we must NOT await the (bounded but still network-bound) subscriber fan-out (#545).
  void notifyStreamLive(tenantId).catch(() => {});
}

async function handleStreamOffline(): Promise<void> {
  await closeOpenStreamSessions(new Date());
  log.info("stream offline");
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Allow GET for endpoint health check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "twitch-eventsub" });
}
