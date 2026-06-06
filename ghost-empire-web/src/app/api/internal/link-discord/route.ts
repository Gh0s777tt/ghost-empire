// src/app/api/internal/link-discord/route.ts
// Two-step Discord linking flow:
//   PUT  — user (authenticated) requests a 6-char code valid 10 minutes
//   POST — bot (authenticated by BOT_SECRET) consumes the code, links Discord ID
// Codes persisted in DB (serverless-safe across function instances).
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/I/1
function generateCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

// === USER → ask for a code ===
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  // Body may include userId for backwards compat with /api/profile/discord-link-code,
  // but we ALWAYS use session userId — never trust client-provided userId.
  const userId = session.user.id;

  // Rate limit: max 5 codes per minute per user
  const rl = await rateLimit(`link:gen:${userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Za dużo prób. Spróbuj za chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // Cleanup expired codes for this user (and globally if cheap)
  await prisma.discordLinkCode.deleteMany({
    where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] },
  });

  // Generate unique code (retry on collision — very rare for 6-char from 32-char alphabet)
  let code = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateCode();
    const exists = await prisma.discordLinkCode.findUnique({ where: { code: candidate } });
    if (!exists) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json({ error: "Nie udało się wygenerować kodu" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 min
  await prisma.discordLinkCode.create({
    data: { code, userId, expiresAt },
  });

  return NextResponse.json({ code, expiresAt });
}

// === BOT → consume code from /link slash command ===
export async function POST(req: Request) {
  const ip = extractIp(req) ?? "unknown";

  // IP rate limit (catches scrapers)
  const ipLimit = await rateLimit(`link:post:ip:${ip}`, 60, 60_000);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded (IP)" },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string; discordId?: string; discordUsername?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = body.code?.toUpperCase().trim();
  const discordId = body.discordId?.trim();
  const discordUsername = body.discordUsername?.trim().slice(0, 100) ?? null;

  if (!code || !discordId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }
  if (!/^\d{1,20}$/.test(discordId)) {
    return NextResponse.json({ error: "Invalid discordId" }, { status: 400 });
  }

  // Per-discord-user rate limit on /link attempts
  const userLimit = await rateLimit(`link:post:user:${discordId}`, 10, 60_000);
  if (!userLimit.allowed) {
    return NextResponse.json(
      { error: "Za dużo prób. Spróbuj za chwilę." },
      { status: 429, headers: rateLimitHeaders(userLimit) },
    );
  }

  const pending = await prisma.discordLinkCode.findUnique({ where: { code } });
  if (!pending) {
    return NextResponse.json({ error: "Kod nie istnieje" }, { status: 404 });
  }
  if (pending.expiresAt < new Date()) {
    await prisma.discordLinkCode.delete({ where: { code } }).catch(() => {});
    return NextResponse.json({ error: "Kod wygasł" }, { status: 410 });
  }

  // Refuse if this Discord ID already linked to a DIFFERENT user
  const existing = await prisma.user.findUnique({ where: { discordId } });
  if (existing && existing.id !== pending.userId) {
    return NextResponse.json(
      { error: "Ten Discord jest już połączony z innym kontem" },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: pending.userId },
      data: { discordId, discordUsername },
    }),
    prisma.discordLinkCode.delete({ where: { code } }),
  ]);

  return NextResponse.json({ ok: true, userId: pending.userId });
}
