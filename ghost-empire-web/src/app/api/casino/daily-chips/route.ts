// src/app/api/casino/daily-chips/route.ts
// FREE daily casino-chips grant: 500 chips once per UTC day. Chips are the casino's
// closed-loop currency (see docs/CHIPS-CASINO.md) — they can ONLY be earned free (this
// route + activity) and can NEVER be bought with money. This is the primary chips source.
//
// Idempotency mirrors /api/daily-bonus exactly: the claim IS a `transaction` row with a
// deterministic `externalId` ("chips:daily:<userId>:<utcDay>") on the unique
// `Transaction.externalId` column — two concurrent claims race the index and exactly one
// wins (P2002), so there is no over-credit and no schema change beyond the `chips` column.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DAILY = 500; // free chips per day (docs/CHIPS-CASINO.md — Faza 3)
const REASON = "chips:daily";
const DAY = 86_400_000;

const dayStartUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

async function getStatus(userId: string) {
  const today0 = dayStartUtc(new Date());
  const [claim, user] = await Promise.all([
    prisma.transaction.findFirst({
      where: { userId, reason: REASON, createdAt: { gte: new Date(today0) } },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { chips: true } }),
  ]);
  return { claimedToday: !!claim, amount: DAILY, chips: user?.chips ?? 0 };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getStatus(session.user.id));
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const rl = await rateLimit(`chips-daily:${userId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const dayKey = dayStartUtc(new Date());
  const externalId = `${REASON}:${userId}:${dayKey}`;

  try {
    const newBalance = await prisma.$transaction(async (tx) => {
      // Fast path: skip the write if today's grant already landed.
      const dup = await tx.transaction.findFirst({
        where: { userId, reason: REASON, createdAt: { gte: new Date(dayKey) } },
        select: { id: true },
      });
      if (dup) throw new Error("DUP");
      // Chips only — do NOT touch tokens/totalEarned (real GT economy stays untouched).
      await tx.user.update({ where: { id: userId }, data: { chips: { increment: DAILY } } });
      // Unique `externalId` is the HARD double-claim guard: a concurrent claim past the
      // fast-path loses here with P2002.
      await tx.transaction.create({ data: { userId, type: "earn", amount: DAILY, reason: REASON, currency: "CHIPS", externalId, status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { chips: true } });
      return u?.chips ?? 0;
    });
    return NextResponse.json({ ok: true, amount: DAILY, newBalance });
  } catch (e) {
    if (e instanceof Error && e.message === "DUP") {
      return NextResponse.json({ error: "Darmowe żetony już odebrane — wróć jutro!" }, { status: 409 });
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Darmowe żetony już odebrane — wróć jutro!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Błąd serwera — spróbuj ponownie" }, { status: 500 });
  }
}
