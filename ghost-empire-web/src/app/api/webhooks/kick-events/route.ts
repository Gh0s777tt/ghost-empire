// src/app/api/webhooks/kick-events/route.ts
// Kick webhook receiver — handles channel.subscription.{new,renewal,gifts}
// channel.followed, livestream.status.updated. Mirror of /api/webhooks/twitch-eventsub.
//
// Verifies RSA-SHA256 signature using Kick's public key (fetched + cached in lib/kick.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyKickSignature, isMessageFresh } from "@/lib/kick";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals } from "@/lib/stream-goals";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";

// Token rewards — mirror of Twitch tunables
const REWARD_KICK_SUB        = 5000;
const REWARD_KICK_GIFTSUB    = 5000;   // per sub gifted
const REWARD_KICK_FOLLOW     = 500;

export async function POST(req: Request) {
  const messageId = req.headers.get("kick-event-message-id");
  const timestamp = req.headers.get("kick-event-message-timestamp");
  const signature = req.headers.get("kick-event-signature");
  const eventType = req.headers.get("kick-event-type");
  const subscriptionId = req.headers.get("kick-event-subscription-id");

  if (!messageId || !timestamp || !signature || !eventType) {
    return NextResponse.json({ error: "Missing required Kick headers" }, { status: 400 });
  }

  const body = await req.text();

  // Signature verification (CRITICAL — prevents spoofed events)
  if (!(await verifyKickSignature(messageId, timestamp, body, signature))) {
    console.warn("[kick-events] invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // Replay protection
  if (!isMessageFresh(timestamp)) {
    console.warn("[kick-events] stale message timestamp");
    return NextResponse.json({ error: "Stale message" }, { status: 403 });
  }

  // Idempotency
  const existing = await prisma.kickEvent.findUnique({ where: { eventId: messageId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Update lastSeenAt on subscription (best-effort)
  if (subscriptionId) {
    await prisma.kickEventSubscription
      .update({ where: { id: subscriptionId }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  let matchedUserId: string | null = null;
  let tokensGranted: number | null = null;

  try {
    if (eventType === "channel.subscription.new" || eventType === "channel.subscription.renewal") {
      const result = await handleSubscription(payload, eventType);
      matchedUserId = result.userId;
      tokensGranted = result.tokens;
    } else if (eventType === "channel.subscription.gifts") {
      const result = await handleGiftSubs(payload);
      matchedUserId = result.userId;
      tokensGranted = result.tokens;
    } else if (eventType === "channel.followed") {
      const result = await handleFollow(payload);
      matchedUserId = result.userId;
      tokensGranted = result.tokens;
    } else if (eventType === "livestream.status.updated") {
      await handleLivestreamStatus(payload);
    } else {
      console.log(`[kick-events] unhandled event type: ${eventType}`);
    }
  } catch (e) {
    console.error(`[kick-events] handler error for ${eventType}:`, e);
  }

  await prisma.kickEvent.create({
    data: {
      eventId: messageId,
      type: eventType,
      payload: JSON.stringify(payload).slice(0, 5000),
      userId: matchedUserId,
      tokensGranted,
    },
  });

  if (matchedUserId) {
    if (eventType === "channel.subscription.new" || eventType === "channel.subscription.renewal") {
      await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "kick_sub_received" });
      await awardSeasonXp(matchedUserId, "kick_sub");
    } else if (eventType === "channel.subscription.gifts") {
      await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "gift_subs_given" });
      const gifteesRaw = payload.giftees as Array<unknown> | undefined;
      await awardSeasonXp(matchedUserId, "gift_sub_each", Array.isArray(gifteesRaw) ? gifteesRaw.length : 1);
    }
  }

  return NextResponse.json({ ok: true });
}

// =====================================================
// Handlers
// =====================================================

async function handleSubscription(
  payload: Record<string, unknown>,
  eventType: string,
): Promise<{ userId: string | null; tokens: number | null }> {
  const subscriber = (payload.subscriber ?? payload.user) as Record<string, unknown> | undefined;
  const username = (subscriber?.username as string)?.toLowerCase();
  const displayName = (subscriber?.username as string) ?? null;

  // Always alert — even non-linked subscribers
  await dispatchAlertSafe({
    type: "twitch_sub",   // reuse the same visual category as Twitch
    title: eventType === "channel.subscription.new" ? "💚 Nowy sub Kick!" : "💚 Sub odnowiony (Kick)!",
    message: eventType === "channel.subscription.new" ? "zasubował kanał na Kicku" : "przedłużył sub na Kicku",
    icon: "💚",
    actorName: displayName ?? username ?? "Anonim",
  });

  await incrementGoals("subs", 1);

  if (!username) return { userId: null, tokens: null };

  const connection = await prisma.connection.findFirst({
    where: { platform: "kick", username: { equals: username, mode: "insensitive" } },
    select: { userId: true, id: true },
  });
  if (!connection) {
    console.log(`[kick-events] sub from ${username} but no linked Ghost Empire account`);
    return { userId: null, tokens: null };
  }

  const tokens = REWARD_KICK_SUB;
  await prisma.$transaction([
    prisma.connection.update({
      where: { id: connection.id },
      data: {
        isSubscriber: true,
        subStartDate: eventType === "channel.subscription.new" ? new Date() : undefined,
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
        reason: eventType === "channel.subscription.new" ? "kick_sub_new" : "kick_sub_renewal",
        status: "completed",
      },
    }),
    prisma.notification.create({
      data: {
        userId: connection.userId,
        type: "system",
        title: "💚 Dzięki za sub na Kicku!",
        message: `Otrzymałeś ${tokens.toLocaleString("pl-PL")} GT.`,
        icon: "💚",
      },
    }),
  ]);

  return { userId: connection.userId, tokens };
}

async function handleGiftSubs(payload: Record<string, unknown>): Promise<{ userId: string | null; tokens: number | null }> {
  const gifter = payload.gifter as Record<string, unknown> | undefined;
  const gifterLogin = (gifter?.username as string)?.toLowerCase();
  const gifterName = (gifter?.username as string) ?? null;
  const gifteesRaw = payload.giftees as Array<Record<string, unknown>> | undefined;
  const total = Array.isArray(gifteesRaw) ? gifteesRaw.length : 1;
  const isAnonymous = !gifterLogin;

  await dispatchAlertSafe({
    type: "twitch_gift_sub",
    title: `🎁 Gifted ${total} sub${total === 1 ? "" : "y"} na Kicku!`,
    message: "rozdał suby community",
    icon: "🎁",
    actorName: isAnonymous ? "Anonymous Gifter" : (gifterName ?? gifterLogin ?? "Anon"),
    amount: total,
    amountLabel: "sub" + (total === 1 ? "" : "y"),
  });

  await incrementGoals("gift_subs", total);
  await incrementGoals("subs", total);

  if (isAnonymous) return { userId: null, tokens: null };

  const connection = await prisma.connection.findFirst({
    where: { platform: "kick", username: { equals: gifterLogin!, mode: "insensitive" } },
    select: { userId: true },
  });
  if (!connection) return { userId: null, tokens: null };

  const tokens = REWARD_KICK_GIFTSUB * total;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: connection.userId },
      data: { tokens: { increment: tokens }, totalEarned: { increment: tokens } },
    }),
    prisma.transaction.create({
      data: {
        userId: connection.userId,
        type: "earn",
        amount: tokens,
        reason: `kick_gift_sub:${total}`,
        status: "completed",
      },
    }),
    prisma.notification.create({
      data: {
        userId: connection.userId,
        type: "system",
        title: `🎁 Dzięki za ${total} gifted sub${total === 1 ? "" : "y"} na Kicku!`,
        message: `Otrzymałeś ${tokens.toLocaleString("pl-PL")} GT za hojność.`,
        icon: "🎁",
      },
    }),
  ]);

  return { userId: connection.userId, tokens };
}

async function handleFollow(payload: Record<string, unknown>): Promise<{ userId: string | null; tokens: number | null }> {
  const follower = payload.follower as Record<string, unknown> | undefined;
  const username = (follower?.username as string)?.toLowerCase();
  const displayName = (follower?.username as string) ?? null;

  await incrementGoals("follows", 1);

  // Optional follow alert — disabled by default in StreamAlertSettings.enabledTypes
  // (admin can enable via toggle). Reusing the welcome type as it's similar in nature.
  await dispatchAlertSafe({
    type: "welcome",
    title: "💚 Nowy follow na Kicku!",
    message: "zaobserwował kanał",
    icon: "💚",
    actorName: displayName ?? username ?? "Anonim",
  });

  if (!username) return { userId: null, tokens: null };

  const connection = await prisma.connection.findFirst({
    where: { platform: "kick", username: { equals: username, mode: "insensitive" } },
    select: { userId: true },
  });
  if (!connection) return { userId: null, tokens: null };

  // Idempotency-light: avoid re-granting follow reward to a user who's already got it.
  const existingFollowReward = await prisma.transaction.findFirst({
    where: { userId: connection.userId, reason: "kick_follow" },
    select: { id: true },
  });
  if (existingFollowReward) return { userId: connection.userId, tokens: null };

  const tokens = REWARD_KICK_FOLLOW;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: connection.userId },
      data: { tokens: { increment: tokens }, totalEarned: { increment: tokens } },
    }),
    prisma.transaction.create({
      data: {
        userId: connection.userId,
        type: "earn",
        amount: tokens,
        reason: "kick_follow",
        status: "completed",
      },
    }),
    prisma.notification.create({
      data: {
        userId: connection.userId,
        type: "system",
        title: "💚 Dzięki za follow na Kicku!",
        message: `Otrzymałeś ${tokens.toLocaleString("pl-PL")} GT.`,
        icon: "💚",
      },
    }),
  ]);

  return { userId: connection.userId, tokens };
}

async function handleLivestreamStatus(payload: Record<string, unknown>): Promise<void> {
  const isLive = payload.is_live as boolean | undefined;
  const title = payload.title as string | undefined;
  console.log(`[kick-events] livestream status: live=${isLive} title="${title}"`);
  // No reward — just logged. Could feed analytics in Phase 3D.
}

// Health check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "kick-events" });
}
