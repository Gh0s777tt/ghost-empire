// src/app/api/internal/award/route.ts
// Used by Discord bot to award tokens for activity (messages, voice).
// Auth: Bearer secret — the global BOT_SECRET (first-party bot) OR this portal's own
// per-tenant secret (a streamer running their own bot); see verifyBotSecretForTenant.
// The target user is matched by discordId SCOPED to the request's tenant, so a portal's
// bot can only award its own users. Rate limit per user (defense in depth if secret leaks).
//
// NO REPLAY PROTECTION HERE — known, and the caps below are the whole defence. The webhook
// routes (webhooks/twitch-eventsub, webhooks/kick-events) verify a signature AND
// isMessageFresh(ts), and Twitch additionally takes a unique-insert idempotency lock on its
// messageId; the internal/* and bot/* routes have none of that, so a captured body +
// Authorization pair replays verbatim. The ceiling is the
// per-user fixed window right below: PER_USER_HITS × PER_USER_AMOUNT_CAP per window, per user.
// Closing it properly needs BOTH a request-id/nonce in every bot call (a contract change in the
// bot repo — every deployed bot breaks the moment this route starts requiring one) and a dedup
// store to remember spent ids. It cannot be faked by hashing the body: legitimate awards ARE
// byte-identical (two "message" awards for the same user in the same minute), so body-dedup
// would silently drop real earnings. Deliberately deferred, not overlooked.
//
// One thing that is NOT part of that gap: rateLimit() fails OPEN on a terminal DB failure and
// these callers do not pass failClosed. That is correct here rather than a second hole — the
// grant is itself a Postgres $transaction, so the same outage that blinds the limiter also
// fails the write; there is nothing to mint through the opened limiter (see lib/rate-limit.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecretForTenant } from "@/lib/utils";
import { getCurrentTenantBotAuth } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";
import { updateDailyTaskProgress } from "@/lib/daily-tasks";
import { happyHourBoost } from "@/lib/happy-hour";

// Per-user safety caps: even with valid bot secret, no user can earn more than X
// in a window. Prevents farm attacks if BOT_SECRET leaks.
const PER_USER_HITS = 30;             // max 30 awards per user
const PER_USER_WINDOW_MS = 60_000;    // ...within 60 seconds
const PER_USER_AMOUNT_CAP = 5_000;    // max 5000 GT in a single call (no whales)

// Global IP-based limit: catches scrapers hitting blindly without valid secret
// before they even reach the auth check.
const PER_IP_HITS = 200;
const PER_IP_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  const ip = extractIp(req) ?? "unknown";

  // Layer 1: IP rate limit (cheap, runs first)
  const ipLimit = await rateLimit(`award:ip:${ip}`, PER_IP_HITS, PER_IP_WINDOW_MS);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded (IP)" },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  // Layer 2: Bot secret auth — accept the global BOT_SECRET (first-party bot, back-compat)
  // OR this portal's own per-tenant secret. Tenant is resolved from the request Host, never
  // a forgeable header. `tenantId` also scopes the user lookup below.
  const { id: tenantId, botSecret } = await getCurrentTenantBotAuth();
  if (!verifyBotSecretForTenant(req.headers.get("authorization"), botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { discordId?: string; amount?: number; reason?: string; multiplier?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { discordId, amount, reason, multiplier = 1 } = body;

  if (!discordId || !amount || !reason) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (typeof discordId !== "string" || !/^\d{1,20}$/.test(discordId)) {
    return NextResponse.json({ error: "Invalid discordId" }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 1 || amount > PER_USER_AMOUNT_CAP) {
    return NextResponse.json(
      { error: `Amount must be 1-${PER_USER_AMOUNT_CAP}` },
      { status: 400 },
    );
  }
  if (typeof reason !== "string" || reason.length > 100) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }
  if (typeof multiplier !== "number" || multiplier < 0.1 || multiplier > 10) {
    return NextResponse.json({ error: "Multiplier 0.1-10" }, { status: 400 });
  }

  // Layer 3: Per-user rate limit (defense in depth — even if secret leaks)
  const userLimit = await rateLimit(
    `award:user:${discordId}`,
    PER_USER_HITS,
    PER_USER_WINDOW_MS,
  );
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded (per user)" },
      { status: 429, headers: rateLimitHeaders(userLimit) },
    );
  }

  // Find user by Discord ID — SCOPED to the request's tenant so a portal's bot can only
  // award ITS OWN users, never another tenant's. discordId is globally unique, so findFirst
  // with the extra tenant filter returns the row only when it belongs here. tenantId null
  // (pre-backfill / outside a request scope) → unscoped, preserving legacy single-tenant behaviour.
  const user = await prisma.user.findFirst({
    where: { discordId, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, tokens: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, reason: "user_not_linked" });
  }

  // Happy hours (admin-configured window, Europe/Warsaw) apply portal-side.
  const finalAmount = Math.round(amount * multiplier * (await happyHourBoost()));

  const [, updatedUser] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId: user.id,
        type: "earn",
        amount: finalAmount,
        reason,
        multiplier,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        tokens:      { increment: finalAmount },
        totalEarned: { increment: finalAmount },
        messageCount: reason === "message" ? { increment: 1 } : undefined,
        voiceMinutes: reason === "voice"   ? { increment: 1 } : undefined,
      },
    }),
  ]);

  if (reason === "message" || reason === "voice") {
    await updateDailyTaskProgress(user.id, reason === "message" ? "messages" : "voice_minutes");
    const { awardSeasonXp } = await import("@/lib/seasons");
    await awardSeasonXp(user.id, reason === "message" ? "chat_message" : "voice_minute");
  }

  return NextResponse.json(
    { ok: true, awarded: finalAmount, newBalance: updatedUser.tokens },
    { headers: rateLimitHeaders(userLimit) },
  );
}
