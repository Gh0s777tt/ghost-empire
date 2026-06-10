// src/app/api/yt/poll-live-chat/route.ts
// Polls YouTube live chat for the streamer's currently-active broadcast.
// Detects super chats + member events, awards tokens, dispatches stream alerts.
//
// Auth modes:
//   1. Admin session (manual "Poll now" from /admin#youtube)
//   2. Bearer poll token (for external cron — cron-job.org / GitHub Actions / chat bot)
//
// Designed to be safe to call as often as the polling interval allows. Vercel Hobby
// can't cron sub-daily, so external cron or the future chat bot is the production option.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { verifyBotSecret } from "@/lib/utils";
import {
  getValidAccessToken,
  getActiveLiveBroadcast,
  getLiveChatMessages,
} from "@/lib/youtube";
import { getYouTubeStreamerToken } from "@/lib/platform-tokens";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";

const YT_SUPERCHAT_GT_PER_PLN = 100;  // matches DONATION_GT_PER_PLN default
const YT_MEMBER_REWARD = 5000;        // new sponsor / member milestone

export const dynamic = "force-dynamic";

async function authorize(req: Request): Promise<{ ok: true; mode: "admin" | "bot" } | { ok: false; status: number; error: string }> {
  // External cron — Bearer BOT_SECRET
  if (verifyBotSecret(req.headers.get("authorization"))) {
    return { ok: true, mode: "bot" };
  }
  // Admin session
  const auth = await requireAdmin();
  if (auth.ok) return { ok: true, mode: "admin" };
  return { ok: false, status: auth.status, error: auth.error };
}

export async function POST(req: Request) {
  const authResult = await authorize(req);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    return await runPoll();
  } catch (e) {
    // Surface the real error to cron-job / admin UI — endpoint is auth-gated so OK to expose
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt/poll-live-chat] FAILED:", msg, e);
    return NextResponse.json(
      { error: "poll_failed", detail: msg.slice(0, 500) },
      { status: 500 },
    );
  }
}

async function runPoll() {
  const streamer = await getYouTubeStreamerToken();
  if (!streamer) {
    return NextResponse.json(
      { error: "Streamer YouTube nie autoryzowany — kliknij 'Autoryzuj YouTube' w /admin#youtube" },
      { status: 400 },
    );
  }

  const accessToken = await getValidAccessToken();

  // Decide which broadcast to poll: cached or rediscover
  let liveChatId = streamer.currentLiveChatId;
  let videoId = streamer.currentLiveVideoId;
  let rediscovered = false;
  if (!liveChatId || !videoId) {
    const broadcast = await getActiveLiveBroadcast(accessToken);
    if (!broadcast) {
      await prisma.youTubeStreamerToken.update({
        where: { id: streamer.id },
        data: { lastPolledAt: new Date() },
      });
      return NextResponse.json({ ok: true, status: "no_active_broadcast" });
    }
    if (!broadcast.liveChatId) {
      return NextResponse.json({ ok: true, status: "broadcast_without_chat", videoId: broadcast.videoId });
    }
    liveChatId = broadcast.liveChatId;
    videoId = broadcast.videoId;
    rediscovered = true;
    await prisma.youTubeStreamerToken.update({
      where: { id: streamer.id },
      data: {
        currentLiveChatId: liveChatId,
        currentLiveVideoId: videoId,
        lastChatPageToken: null,
      },
    });
  }

  // Poll messages incrementally
  const { messages, nextPageToken, pollingIntervalMs } = await getLiveChatMessages(
    liveChatId,
    streamer.lastChatPageToken,
    accessToken,
  );

  // Chat ended or no messages
  if (messages.length === 0 && !nextPageToken) {
    // Likely stream ended — clear cached broadcast so next poll rediscovers
    await prisma.youTubeStreamerToken.update({
      where: { id: streamer.id },
      data: {
        lastPolledAt: new Date(),
        currentLiveChatId: null,
        currentLiveVideoId: null,
        lastChatPageToken: null,
      },
    });
    return NextResponse.json({ ok: true, status: "chat_ended" });
  }

  let superChatsProcessed = 0;
  let memberEventsProcessed = 0;
  let messagesLogged = 0;

  for (const msg of messages) {
    // Idempotency — skip if already processed
    const existing = await prisma.youTubeEvent.findUnique({ where: { messageId: msg.id } });
    if (existing) continue;

    if (msg.type === "superChatEvent" || msg.type === "superStickerEvent") {
      const result = await handleSuperChat({
        messageId: msg.id,
        videoId: videoId!,
        authorChannelId: msg.authorChannelId ?? null,
        authorName: msg.authorDisplayName ?? null,
        message: msg.message ?? null,
        amountMicros: msg.amountMicros ?? 0n,
        currency: msg.currency ?? "USD",
      });
      if (result) superChatsProcessed++;
    } else if (msg.type === "newSponsorEvent" || msg.type === "memberMilestoneChatEvent") {
      const result = await handleMemberEvent({
        messageId: msg.id,
        videoId: videoId!,
        type: msg.type,
        authorChannelId: msg.authorChannelId ?? null,
        authorName: msg.authorDisplayName ?? null,
        message: msg.message ?? null,
      });
      if (result) memberEventsProcessed++;
    } else if (msg.type === "textMessageEvent") {
      // Log but don't process — useful for Phase 3 analytics
      await prisma.youTubeEvent
        .create({
          data: {
            messageId: msg.id,
            videoId: videoId!,
            type: msg.type,
            authorChannelId: msg.authorChannelId,
            authorName: msg.authorDisplayName,
            message: msg.message?.slice(0, 2000),
          },
        })
        .catch(() => {});
      messagesLogged++;
    }
  }

  await prisma.youTubeStreamerToken.update({
    where: { id: streamer.id },
    data: {
      lastPolledAt: new Date(),
      lastChatPageToken: nextPageToken,
    },
  });

  return NextResponse.json({
    ok: true,
    status: "polled",
    rediscovered,
    videoId,
    messagesFetched: messages.length,
    superChatsProcessed,
    memberEventsProcessed,
    messagesLogged,
    nextPollSuggestedMs: pollingIntervalMs,
  });
}

// =====================================================
// Handlers
// =====================================================

async function handleSuperChat(input: {
  messageId: string;
  videoId: string;
  authorChannelId: string | null;
  authorName: string | null;
  message: string | null;
  amountMicros: bigint;
  currency: string;
}): Promise<boolean> {
  const amountFloat = Number(input.amountMicros) / 1_000_000;
  if (!Number.isFinite(amountFloat) || amountFloat <= 0) return false;

  // Match donor to Ghost Empire user via YouTube Connection.platformId
  let matchedUserId: string | null = null;
  let tokensGranted: number | null = null;
  if (input.authorChannelId) {
    const connection = await prisma.connection.findFirst({
      where: { platform: "youtube", platformId: input.authorChannelId },
      select: { userId: true },
    });
    if (connection) {
      matchedUserId = connection.userId;
      // Static approximate FX → PLN, for GT crediting only (not accounting). Unknown
      // currencies fall back to the USD rate (the old behavior for everything).
      const PLN_PER: Record<string, number> = {
        PLN: 1, ZL: 1, USD: 4.0, EUR: 4.3, GBP: 5.0, CHF: 4.5, CAD: 2.9, AUD: 2.6,
        NOK: 0.38, SEK: 0.38, DKK: 0.58, CZK: 0.17, UAH: 0.1, JPY: 0.027, KRW: 0.003,
        BRL: 0.7, MXN: 0.2, INR: 0.048,
      };
      const pln = amountFloat * (PLN_PER[input.currency.toUpperCase()] ?? 4.0);
      tokensGranted = Math.round(pln * YT_SUPERCHAT_GT_PER_PLN);

      const amountGrosze = Math.round(pln * 100);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: matchedUserId },
          data: {
            isDonator: true,
            totalDonated: { increment: amountGrosze },
            tokens: { increment: tokensGranted },
            totalEarned: { increment: tokensGranted },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: matchedUserId,
            type: "earn",
            amount: tokensGranted,
            reason: `yt_superchat:${input.currency}:${amountFloat.toFixed(2)}`,
            status: "completed",
            note: input.message?.slice(0, 500) ?? null,
          },
        }),
        prisma.notification.create({
          data: {
            userId: matchedUserId,
            type: "system",
            title: `⭐ Dzięki za Super Chat ${amountFloat.toFixed(2)} ${input.currency}!`,
            message: `Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} GT.`,
            icon: "⭐",
            link: "/profile",
          },
        }),
        prisma.donation.create({
          data: {
            externalId: `yt:${input.messageId}`,
            source: "youtube_superchat",
            donorName: input.authorName ?? "Anon",
            message: input.message?.slice(0, 2000) ?? null,
            amountGrosze,
            currency: input.currency,
            donatedAt: new Date(),
            userId: matchedUserId,
            matchedAt: new Date(),
            matchType: "auto_yt_channel",
            tokensGranted,
          },
        }),
      ]);
    }
  }

  await prisma.youTubeEvent.create({
    data: {
      messageId: input.messageId,
      videoId: input.videoId,
      type: "superChat",
      authorChannelId: input.authorChannelId,
      authorName: input.authorName,
      message: input.message?.slice(0, 2000),
      amountMicros: input.amountMicros,
      currency: input.currency,
      userId: matchedUserId,
      tokensGranted,
    },
  });

  // Stream alert — fires for every super chat regardless of match
  await dispatchAlertSafe({
    type: "donation",
    title: `⭐ Super Chat!`,
    message: input.message
      ? `wpłacił z wiadomością: ${input.message.slice(0, 80)}`
      : "wsparł Super Chatem",
    icon: "⭐",
    actorName: input.authorName ?? "Anonim",
    amount: Math.round(amountFloat * 100) / 100,
    amountLabel: input.currency,
  });

  // Bump donations_pln goal (currency conversion same as Streamlabs handler)
  const plnAmount = ["PLN", "ZL"].includes(input.currency.toUpperCase())
    ? amountFloat
    : amountFloat * 4;
  await incrementGoals("donations_pln", Math.floor(plnAmount));
  void extendSubathon({ pln: Math.floor(plnAmount) });

  // Achievements — both general donation and YT super chat specific
  if (matchedUserId) {
    await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "donations_count" });
    await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "donations_amount_pln" });
    await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "super_chats_received" });
    await awardSeasonXp(matchedUserId, "donation_per_pln", plnAmount);
  }

  return true;
}

async function handleMemberEvent(input: {
  messageId: string;
  videoId: string;
  type: string;
  authorChannelId: string | null;
  authorName: string | null;
  message: string | null;
}): Promise<boolean> {
  let matchedUserId: string | null = null;
  let tokensGranted: number | null = null;

  if (input.authorChannelId) {
    const connection = await prisma.connection.findFirst({
      where: { platform: "youtube", platformId: input.authorChannelId },
      select: { userId: true, id: true },
    });
    if (connection) {
      matchedUserId = connection.userId;
      tokensGranted = YT_MEMBER_REWARD;
      await prisma.$transaction([
        prisma.connection.update({
          where: { id: connection.id },
          data: { isSubscriber: true, subStartDate: new Date() },
        }),
        prisma.user.update({
          where: { id: matchedUserId },
          data: {
            tokens: { increment: tokensGranted },
            totalEarned: { increment: tokensGranted },
          },
        }),
        prisma.transaction.create({
          data: {
            userId: matchedUserId,
            type: "earn",
            amount: tokensGranted,
            reason: `yt_member:${input.type}`,
            status: "completed",
          },
        }),
        prisma.notification.create({
          data: {
            userId: matchedUserId,
            type: "system",
            title: input.type === "newSponsorEvent" ? "📺 Witaj członku!" : "📺 Dzięki za milestone!",
            message: `Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} GT za członkostwo YouTube.`,
            icon: "📺",
          },
        }),
      ]);
    }
  }

  await prisma.youTubeEvent.create({
    data: {
      messageId: input.messageId,
      videoId: input.videoId,
      type: input.type === "newSponsorEvent" ? "newSponsor" : "memberMilestone",
      authorChannelId: input.authorChannelId,
      authorName: input.authorName,
      message: input.message?.slice(0, 2000),
      userId: matchedUserId,
      tokensGranted,
    },
  });

  await dispatchAlertSafe({
    type: "twitch_sub", // reuse the sub alert type — visually equivalent
    title: input.type === "newSponsorEvent" ? "📺 Nowy YouTube Member!" : "📺 Member milestone!",
    message: "wsparł kanał członkostwem",
    icon: "📺",
    actorName: input.authorName ?? "Anonim",
  });

  await incrementGoals("yt_members", 1);

  if (matchedUserId) {
    await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "yt_member" });
  }

  return true;
}

// Health check
export async function GET() {
  const streamer = await getYouTubeStreamerToken();
  return NextResponse.json({
    ok: true,
    streamerConnected: !!streamer,
    channelTitle: streamer?.channelTitle ?? null,
    currentLiveVideoId: streamer?.currentLiveVideoId ?? null,
    lastPolledAt: streamer?.lastPolledAt?.toISOString() ?? null,
  });
}
