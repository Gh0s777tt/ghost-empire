// src/app/api/profile/discord-link-code/route.ts
// Generate a Discord link code for the authenticated user. Forwards to the
// internal link-discord endpoint (PUT) which manages the in-memory code map.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  // Direct DB write (we already have session — no need for HTTP indirection).
  // /api/internal/link-discord PUT is now session-based and identical.
  const { randomInt } = await import("node:crypto");
  const { prisma } = await import("@/lib/prisma");
  const { rateLimit, rateLimitHeaders } = await import("@/lib/rate-limit");

  const userId = session.user.id;

  const rl = await rateLimit(`link:gen:${userId}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Za dużo prób. Spróbuj za chwilę." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  await prisma.discordLinkCode.deleteMany({
    where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] },
  });

  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    const candidate = Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
    const exists = await prisma.discordLinkCode.findUnique({ where: { code: candidate } });
    if (!exists) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json({ error: "Nie udało się wygenerować kodu" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await prisma.discordLinkCode.create({ data: { code, userId, expiresAt } });

  return NextResponse.json({ code, expiresAt });
}
