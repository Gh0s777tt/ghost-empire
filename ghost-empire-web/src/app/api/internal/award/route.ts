// src/app/api/internal/award/route.ts
// Used by Discord bot to award tokens for activity (messages, voice).
// Protected by Bearer BOT_SECRET + rate limit per user (defense in depth if secret leaks).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";

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

  // Layer 2: Bot secret auth
  if (!verifyBotSecret(req.headers.get("authorization"))) {
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

  // Find user by Discord ID
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true, tokens: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, reason: "user_not_linked" });
  }

  const finalAmount = Math.round(amount * multiplier);

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
    await updateDailyTaskProgress(user.id, reason);
  }

  return NextResponse.json(
    { ok: true, awarded: finalAmount, newBalance: updatedUser.tokens },
    { headers: rateLimitHeaders(userLimit) },
  );
}

async function updateDailyTaskProgress(userId: string, reason: string) {
  const { today } = await import("@/lib/utils");
  const triggerType = reason === "message" ? "messages" : "voice_minutes";

  const tasks = await prisma.dailyTask.findMany({
    where: { triggerType, active: true },
  });

  for (const task of tasks) {
    await prisma.userTask.upsert({
      where: { userId_taskId_date: { userId, taskId: task.id, date: today() } },
      create: { userId, taskId: task.id, date: today(), progress: 1 },
      update: { progress: { increment: 1 } },
    });
  }
}
