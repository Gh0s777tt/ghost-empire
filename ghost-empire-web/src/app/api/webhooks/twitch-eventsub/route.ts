// src/app/api/webhooks/twitch-eventsub/route.ts
// Twitch EventSub webhook handler.
// Three message types we receive:
//   - "webhook_callback_verification" — challenge to confirm endpoint ownership
//   - "notification" — actual event payload
//   - "revocation" — Twitch tells us they removed a subscription
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEventSubSignature, isMessageFresh } from "@/lib/twitch";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals, setHypeTrainStart, setHypeTrainProgress, setHypeTrainEnded } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";

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
    console.warn("[twitch-eventsub] invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // Replay protection
  if (!isMessageFresh(timestamp)) {
    console.warn("[twitch-eventsub] stale message timestamp");
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
    console.log("[twitch-eventsub] challenge accepted for subscription:", parsed.subscription?.id);
    return new Response(parsed.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // === Revocation ===
  if (messageType === "revocation") {
    console.warn(`[twitch-eventsub] subscription revoked:`, parsed.subscription);
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

  // Idempotency — skip if we already saw this message
  const existing = await prisma.twitchEvent.findUnique({ where: { eventId: messageId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const eventType = parsed.subscription?.type;
  const event = parsed.event;
  if (!eventType || !event) {
    return NextResponse.json({ error: "Missing event data" }, { status: 400 });
  }

  // Update lastSeenAt on subscription
  if (parsed.subscription?.id) {
    await prisma.twitchEventSubscription.update({
      where: { id: parsed.subscription.id },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});
  }

  // Save raw event for audit
  let matchedUserId: string | null = null;
  let tokensGranted: number | null = null;

  try {
    if (eventType === "channel.subscribe") {
      const result = await handleSubscribe(event);
      matchedUserId = result.userId;
      tokensGranted = result.tokens;
    } else if (eventType === "channel.subscription.gift") {
      const result = await handleGiftSub(event);
      matchedUserId = result.userId;
      tokensGranted = result.tokens;
    } else if (eventType === "channel.cheer") {
      const result = await handleCheer(event);
      matchedUserId = result.userId;
      tokensGranted = result.tokens;
    } else if (eventType === "channel.hype_train.begin") {
      await handleHypeTrainBegin(event);
    } else if (eventType === "channel.hype_train.progress") {
      await handleHypeTrainProgress(event);
    } else if (eventType === "channel.hype_train.end") {
      await handleHypeTrainEnd(event);
    } else {
      console.log(`[twitch-eventsub] unhandled event type: ${eventType}`);
    }
  } catch (e) {
    console.error(`[twitch-eventsub] handler error for ${eventType}:`, e);
  }

  await prisma.twitchEvent.create({
    data: {
      eventId: messageId,
      type: eventType,
      payload: JSON.stringify(event).slice(0, 5000),
      userId: matchedUserId,
      tokensGranted,
    },
  });

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

  return NextResponse.json({ ok: true });
}

// === Handlers ===

async function handleSubscribe(event: Record<string, unknown>): Promise<{ userId: string | null; tokens: number | null }> {
  const userLogin = (event.user_login as string)?.toLowerCase();
  const userName = event.user_name as string | undefined;
  const tier = (event.tier as string) ?? "1000";
  const isGift = event.is_gift as boolean | undefined;

  // Skip gifted subs here — they're handled by the gifter's `channel.subscription.gift` event
  if (isGift) {
    console.log(`[twitch-eventsub] subscribe ignored (gifted sub) for ${userLogin}`);
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
  });

  // Bump any active "subs" stream goals
  await incrementGoals("subs", 1);
  void extendSubathon({ subs: 1 });

  // Find Ghost Empire user via Connection.username on Twitch
  const connection = await prisma.connection.findFirst({
    where: { platform: "twitch", username: { equals: userLogin, mode: "insensitive" } },
    select: { userId: true, id: true },
  });
  if (!connection) {
    console.log(`[twitch-eventsub] sub from ${userLogin} but no linked Ghost Empire account`);
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

async function handleGiftSub(event: Record<string, unknown>): Promise<{ userId: string | null; tokens: number | null }> {
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
  });

  // Bump goals — both gift_subs (count) and subs (because each gift = a sub for someone)
  await incrementGoals("gift_subs", total);
  await incrementGoals("subs", total);
  void extendSubathon({ subs: total });

  if (isAnonymous || !gifterLogin) {
    console.log("[twitch-eventsub] anonymous gift sub — no reward");
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

async function handleCheer(event: Record<string, unknown>): Promise<{ userId: string | null; tokens: number | null }> {
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
    });
    await incrementGoals("cheers_bits", bits);
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

async function handleHypeTrainBegin(event: Record<string, unknown>): Promise<void> {
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
  });

  await dispatchAlertSafe({
    type: "twitch_cheer",  // reuse cheer alert visual
    title: `🚂 HYPE TRAIN STARTED! (Level ${level})`,
    message: `wszystkie suby/bity teraz nakręcają hype train`,
    icon: "🚂",
    amount: level,
    amountLabel: "level",
  });
}

async function handleHypeTrainProgress(event: Record<string, unknown>): Promise<void> {
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
  });
}

async function handleHypeTrainEnd(event: Record<string, unknown>): Promise<void> {
  const level = (event.level as number) ?? 1;
  const total = (event.total as number) ?? 0;

  await setHypeTrainEnded();

  await dispatchAlertSafe({
    type: "twitch_cheer",
    title: `🚂 HYPE TRAIN ENDED — Level ${level}!`,
    message: "świetna jazda community!",
    icon: "🏁",
    amount: total,
    amountLabel: "pkt",
  });
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
