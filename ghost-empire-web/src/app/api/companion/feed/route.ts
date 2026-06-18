// src/app/api/companion/feed/route.ts
// Feed GT to the Ghost Companion. This is a real economy SINK: the GT are
// decremented from the user and BURNED (a spend transaction with no recipient),
// the companion gains xp 1:1. Atomic balance guard mirrors shop/buy.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isValidFeed } from "@/lib/companion";
import { createLogger } from "@/lib/logger";

const log = createLogger("companion-feed");

export const dynamic = "force-dynamic";

class FeedError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  let body: { amount?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }
  const amount = Math.floor(Number(body.amount));
  if (!isValidFeed(amount)) return jsonError("Nieprawidłowa ilość GT", 400);

  const rl = await rateLimit(`companion:feed:${userId}`, 20, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const tid = await currentTenantId();
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic balance guard: decrement only if the user can afford it.
      const dec = await tx.user.updateMany({
        where: { id: userId, tokens: { gte: amount } },
        data: { tokens: { decrement: amount }, totalSpent: { increment: amount } },
      });
      if (dec.count === 0) throw new FeedError("Za mało Ghost Tokens", 402);

      const companion = await tx.companion.upsert({
        where: { userId },
        create: { userId, xp: amount, lastFedAt: new Date(), ...(tid ? { tenantId: tid } : {}) },
        update: { xp: { increment: amount }, lastFedAt: new Date() },
        select: { name: true, xp: true, lastFedAt: true },
      });

      // Burn record — spend with no recipient (GT leaves circulation).
      await tx.transaction.create({
        data: { userId, type: "spend", amount: -amount, reason: "companion_feed", status: "completed" },
      });

      const fresh = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return { companion, balance: fresh?.tokens ?? 0 };
    });

    return NextResponse.json({
      name: result.companion.name,
      xp: result.companion.xp,
      lastFedAt: result.companion.lastFedAt?.toISOString() ?? null,
      newBalance: result.balance,
      fed: amount,
    });
  } catch (e) {
    if (e instanceof FeedError) return jsonError(e.message, e.status);
    log.error("feed error", e);
    return jsonError("Błąd serwera", 500);
  }
}
