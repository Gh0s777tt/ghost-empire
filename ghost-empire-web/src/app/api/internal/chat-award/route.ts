// src/app/api/internal/chat-award/route.ts
// Awards Ghost Tokens to a viewer who chatted on Twitch / Kick / YouTube. The
// chatter is matched to a Ghost Empire user via their linked Connection (by the
// stable platformId, or username as fallback). Called by ghost-empire-chat.
//
// Mirrors /api/internal/award (Discord) but keyed on a streaming platform instead
// of discordId. Bearer BOT_SECRET + layered rate limits (defense in depth).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";
import { levelGtMultiplier } from "@/lib/economy";

// Per-user caps: even with a valid secret, no single viewer can be farmed.
const PER_USER_HITS = 30;
const PER_USER_WINDOW_MS = 60_000;
const PER_USER_AMOUNT_CAP = 5_000;

// IP cap: the bot fires from ONE host across many chatters, so this is generous —
// it mainly stops unauthenticated scrapers before the auth check.
const PER_IP_HITS = 1_000;
const PER_IP_WINDOW_MS = 60_000;

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

export async function POST(req: Request) {
  const ip = extractIp(req) ?? "unknown";

  const ipLimit = await rateLimit(`chat-award:ip:${ip}`, PER_IP_HITS, PER_IP_WINDOW_MS);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded (IP)" },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    platform?: string;
    platformUserId?: string;
    username?: string;
    amount?: number;
    reason?: string;
    multiplier?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { platform, platformUserId, username, amount, reason, multiplier = 1 } = body;

  if (!platform || !PLATFORMS.has(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  if (!platformUserId && !username) {
    return NextResponse.json({ error: "Need platformUserId or username" }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 1 || amount > PER_USER_AMOUNT_CAP) {
    return NextResponse.json({ error: `Amount must be 1-${PER_USER_AMOUNT_CAP}` }, { status: 400 });
  }
  if (typeof reason !== "string" || reason.length > 100) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }
  if (typeof multiplier !== "number" || multiplier < 0.1 || multiplier > 10) {
    return NextResponse.json({ error: "Multiplier 0.1-10" }, { status: 400 });
  }

  // Match the chatter to a linked account — prefer the stable platformId.
  const connection = platformUserId
    ? await prisma.connection.findUnique({
        where: { platform_platformId: { platform, platformId: String(platformUserId) } },
        select: { userId: true, user: { select: { level: true } } },
      })
    : await prisma.connection.findFirst({
        where: { platform, username: { equals: username!, mode: "insensitive" } },
        select: { userId: true, user: { select: { level: true } } },
      });

  if (!connection) {
    // Chatter hasn't linked this platform to Ghost Empire — bot silently skips.
    return NextResponse.json({ ok: false, reason: "user_not_linked" });
  }

  const userLimit = await rateLimit(
    `chat-award:user:${connection.userId}`,
    PER_USER_HITS,
    PER_USER_WINDOW_MS,
  );
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded (per user)" },
      { status: 429, headers: rateLimitHeaders(userLimit) },
    );
  }

  // Account-level perk: higher level = bigger GT earn multiplier (+0.5%/level, cap +50%).
  const levelMult = levelGtMultiplier(connection.user?.level ?? 1);
  const finalAmount = Math.round(amount * multiplier * levelMult);

  const [, updatedUser] = await prisma.$transaction([
    prisma.transaction.create({
      data: { userId: connection.userId, type: "earn", amount: finalAmount, reason, multiplier },
    }),
    prisma.user.update({
      where: { id: connection.userId },
      data: {
        tokens: { increment: finalAmount },
        totalEarned: { increment: finalAmount },
        messageCount: { increment: 1 },
      },
    }),
  ]);

  // Chat activity also feeds the battle-pass + daily quests (best-effort; own queries).
  const { awardSeasonXp } = await import("@/lib/seasons");
  await awardSeasonXp(connection.userId, "chat_message");
  const { updateDailyTaskProgress } = await import("@/lib/daily-tasks");
  await updateDailyTaskProgress(connection.userId, "messages");

  // Activity heatmap bucket (Europe/Warsaw day-of-week + hour). Best-effort.
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw", weekday: "short", hour: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const dayOfWeek = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0;
    const hour = (parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) || 0) % 24;
    await prisma.chatActivityBucket.upsert({
      where: { dayOfWeek_hour: { dayOfWeek, hour } },
      create: { dayOfWeek, hour, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch {
    /* best-effort analytics — never blocks the award */
  }

  return NextResponse.json(
    { ok: true, awarded: finalAmount, newBalance: updatedUser.tokens },
    { headers: rateLimitHeaders(userLimit) },
  );
}
