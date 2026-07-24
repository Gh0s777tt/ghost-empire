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
import { gtFromPln } from "@/lib/donation-rate";
import { currentTenantId } from "@/lib/tenant";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { checkAndGrantAchievements } from "@/lib/achievements";
import { awardSeasonXp } from "@/lib/seasons";
import { createLogger } from "@/lib/logger";

const log = createLogger("yt-poll");

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

  // Admin "Poll now" → just this admin's portal (resolved from the request host). External
  // cron/bot (Bearer) → EVERY portal that has a YouTube streamer token. Previously this
  // polled the default row only, so sub-tenant super chats / members were never ingested.
  if (authResult.mode === "admin") {
    const tid = await currentTenantId();
    try {
      const r = await runPoll(tid);
      return NextResponse.json(r, r.ok ? undefined : { status: r.httpStatus });
    } catch (e) {
      // Surface the real error to the admin UI — endpoint is auth-gated so OK to expose.
      const msg = e instanceof Error ? e.message : String(e);
      log.error("FAILED", e);
      return NextResponse.json({ error: "poll_failed", detail: msg.slice(0, 500) }, { status: 500 });
    }
  }

  // bot/cron: poll every portal; one portal's failure must not abort the others.
  const tokens = await prisma.youTubeStreamerToken.findMany({ select: { tenantId: true } });
  const results: Array<{ tenantId: string | null; ok: boolean; status: string; error?: string }> = [];
  for (const tk of tokens) {
    try {
      const r = await runPoll(tk.tenantId);
      results.push({ tenantId: tk.tenantId, ok: r.ok, status: r.status, ...(r.ok ? {} : { error: r.error }) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("poll failed for portal", { tenantId: tk.tenantId, error: msg });
      results.push({ tenantId: tk.tenantId, ok: false, status: "error", error: msg.slice(0, 300) });
    }
  }
  return NextResponse.json({ ok: true, portals: results.length, results });
}

async function runPoll(tenantId: string | null) {
  const streamer = await getYouTubeStreamerToken(tenantId);
  if (!streamer) {
    return {
      ok: false as const,
      httpStatus: 400,
      status: "not_authorized",
      error: "Streamer YouTube nie autoryzowany — kliknij 'Autoryzuj YouTube' w /admin#youtube",
    };
  }

  const accessToken = await getValidAccessToken(tenantId);

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
      return { ok: true as const, status: "no_active_broadcast" };
    }
    if (!broadcast.liveChatId) {
      return { ok: true as const, status: "broadcast_without_chat", videoId: broadcast.videoId };
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
    return { ok: true as const, status: "chat_ended" };
  }

  let superChatsProcessed = 0;
  let memberEventsProcessed = 0;
  let messagesLogged = 0;

  // Idempotency: ONE batched read of already-logged messageIds instead of a findUnique
  // per message against the small (max:3) pool (#748). messageId is @unique.
  const processed = new Set(
    (
      await prisma.youTubeEvent.findMany({
        where: { messageId: { in: messages.map((m) => m.id) } },
        select: { messageId: true },
      })
    ).map((row) => row.messageId),
  );

  for (const msg of messages) {
    // Idempotency — skip if already processed
    if (processed.has(msg.id)) continue;
    processed.add(msg.id); // remember within-page so a duplicate id can't double-insert

    if (msg.type === "superChatEvent" || msg.type === "superStickerEvent") {
      const result = await handleSuperChat({
        messageId: msg.id,
        videoId: videoId!,
        authorChannelId: msg.authorChannelId ?? null,
        authorName: msg.authorDisplayName ?? null,
        message: msg.message ?? null,
        amountMicros: msg.amountMicros ?? 0n,
        currency: msg.currency ?? "USD",
        tenantId: streamer.tenantId,
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
        tenantId: streamer.tenantId,
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

  return {
    ok: true as const,
    status: "polled",
    rediscovered,
    videoId,
    messagesFetched: messages.length,
    superChatsProcessed,
    memberEventsProcessed,
    messagesLogged,
    nextPollSuggestedMs: pollingIntervalMs,
  };
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
  tenantId: string | null;
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
      tokensGranted = gtFromPln(pln); // shared rate + cap (was uncapped)

      const amountGrosze = Math.round(pln * 100);
      try {
        await prisma.$transaction([
          // Dedup write folded INTO the grant tx so a concurrent replay (admin
          // "Poll now" racing the cron) trips the unique messageId and rolls the
          // double credit back instead of paying out twice (B1).
          prisma.youTubeEvent.create({
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
          }),
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
              tenantId: input.tenantId, // Batch B: scope to the streamer's portal
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
      } catch (e) {
        // Unique messageId tripped → another poll already processed this super chat.
        if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") return false;
        throw e;
      }
    }
  }

  // Unmatched donor (or no channel id): still record the event for dedup/analytics.
  if (!matchedUserId) {
    try {
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
          userId: null,
          tokensGranted: null,
        },
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") return false;
      throw e;
    }
  }

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
  }, input.tenantId);

  // Bump donations_pln goal (currency conversion same as Streamlabs handler)
  const plnAmount = ["PLN", "ZL"].includes(input.currency.toUpperCase())
    ? amountFloat
    : amountFloat * 4;
  await incrementGoals("donations_pln", Math.floor(plnAmount), input.tenantId);
  void extendSubathon({ pln: Math.floor(plnAmount) }, input.tenantId).catch(() => {});

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
  tenantId: string | null;
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
      try {
        await prisma.$transaction([
          // Dedup write folded INTO the grant tx so a concurrent replay can't
          // double-credit the member reward (B2 — same fix as the super chat path).
          prisma.youTubeEvent.create({
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
          }),
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
      } catch (e) {
        if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") return false;
        throw e;
      }
    }
  }

  // Unmatched member (or no channel id): still record the event for dedup/analytics.
  if (!matchedUserId) {
    try {
      await prisma.youTubeEvent.create({
        data: {
          messageId: input.messageId,
          videoId: input.videoId,
          type: input.type === "newSponsorEvent" ? "newSponsor" : "memberMilestone",
          authorChannelId: input.authorChannelId,
          authorName: input.authorName,
          message: input.message?.slice(0, 2000),
          userId: null,
          tokensGranted: null,
        },
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") return false;
      throw e;
    }
  }

  await dispatchAlertSafe({
    type: "twitch_sub", // reuse the sub alert type — visually equivalent
    title: input.type === "newSponsorEvent" ? "📺 Nowy YouTube Member!" : "📺 Member milestone!",
    message: "wsparł kanał członkostwem",
    icon: "📺",
    actorName: input.authorName ?? "Anonim",
  }, input.tenantId);

  await incrementGoals("yt_members", 1, input.tenantId);

  if (matchedUserId) {
    await checkAndGrantAchievements({ userId: matchedUserId, triggerType: "yt_member" });
  }

  return true;
}

// Health check — scoped to the portal in the request host so a sub-tenant admin sees
// THEIR YouTube connection status, not the founder's default row.
export async function GET() {
  const streamer = await getYouTubeStreamerToken(await currentTenantId());
  return NextResponse.json({
    ok: true,
    streamerConnected: !!streamer,
    channelTitle: streamer?.channelTitle ?? null,
    currentLiveVideoId: streamer?.currentLiveVideoId ?? null,
    lastPolledAt: streamer?.lastPolledAt?.toISOString() ?? null,
  });
}
