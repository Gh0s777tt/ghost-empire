// src/app/api/daily-bonus/route.ts
// Daily login bonus with a growing streak: day 1 = 50 GT, +25 GT per consecutive
// day, capped at 200 GT (day 7+). No schema changes — claims ARE the `transaction`
// rows (reason "daily-bonus"), and the streak is derived from their UTC days.
// Double-claim safe at the DB level: each claim's `externalId` is a deterministic
// "daily-bonus:<userId>:<utcDay>" key on the already-unique `Transaction.externalId`
// column, so two concurrent claims race on the unique index and exactly one wins
// (P2002) — no over-credit, no Serializable/retry dance needed (#audit-M4).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BASE = 50;
const STEP = 25;
const CAP = 200;
const REASON = "daily-bonus";
const DAY = 86_400_000;

const dayStartUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
/** Reward for the (streakSoFar + 1)-th consecutive day. */
const rewardFor = (streakSoFar: number) => Math.min(BASE + STEP * streakSoFar, CAP);

async function getStatus(userId: string) {
  const since = new Date(Date.now() - 12 * DAY); // enough history to derive a capped streak
  const txs = await prisma.transaction.findMany({
    where: { userId, reason: REASON, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const today0 = dayStartUtc(new Date());
  const days = new Set(txs.map((t) => dayStartUtc(t.createdAt)));
  const claimedToday = days.has(today0);
  let streak = 0;
  let cursor = claimedToday ? today0 : today0 - DAY; // consecutive run ending today/yesterday
  while (days.has(cursor)) { streak++; cursor -= DAY; }
  return { claimedToday, streak, nextReward: rewardFor(streak) };
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

  // Per-user throttle on the token-granting path. The unique `externalId` already blocks
  // double-claims; this caps session/spam attempts for parity with other economy routes. #audit-M
  const rl = await rateLimit(`daily-bonus:${userId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Za szybko. Spróbuj za chwilę." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const s = await getStatus(userId);
  if (s.claimedToday) return NextResponse.json({ error: "Bonus już odebrany — wróć jutro!" }, { status: 409 });
  const reward = s.nextReward;

  const dayKey = dayStartUtc(new Date());
  const externalId = `${REASON}:${userId}:${dayKey}`;

  try {
    const newBalance = await prisma.$transaction(async (tx) => {
      // Fast path: skip the write if today's claim already landed in this tenant.
      const dup = await tx.transaction.findFirst({
        where: { userId, reason: REASON, createdAt: { gte: new Date(dayKey) } },
        select: { id: true },
      });
      if (dup) throw new Error("DUP");
      await tx.user.update({ where: { id: userId }, data: { tokens: { increment: reward }, totalEarned: { increment: reward } } });
      // The unique `externalId` is the HARD double-claim guard — a concurrent claim
      // that slipped past the fast-path above loses here with P2002 (#audit-M4).
      await tx.transaction.create({ data: { userId, type: "earn", amount: reward, reason: REASON, externalId, status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
      return u?.tokens ?? 0;
    });
    return NextResponse.json({ ok: true, reward, streak: s.streak + 1, newBalance });
  } catch (e) {
    if (e instanceof Error && e.message === "DUP") {
      return NextResponse.json({ error: "Bonus już odebrany — wróć jutro!" }, { status: 409 });
    }
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Bonus już odebrany — wróć jutro!" }, { status: 409 });
    }
    return NextResponse.json({ error: "Błąd serwera — spróbuj ponownie" }, { status: 500 });
  }
}
