// src/app/api/predictions/route.ts
// Public — lists open + recently-resolved predictions for the /predictions page.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { lockExpiredPredictions } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();

  await lockExpiredPredictions();

  const [active, recent] = await Promise.all([
    prisma.prediction.findMany({
      where: { status: { in: ["open", "locked"] }, ...(tid ? { tenantId: tid } : {}) },
      select: { id: true, question: true, status: true, options: true, totalPot: true, opensAt: true, closesAt: true },
      orderBy: { opensAt: "desc" },
    }),
    prisma.prediction.findMany({
      where: { status: { in: ["resolved", "cancelled"] }, ...(tid ? { tenantId: tid } : {}) },
      include: {
        entries: userId
          ? { where: { userId }, select: { optionIndex: true, tokensWagered: true, payout: true } }
          : false,
      },
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
  ]);

  // Per-option wager aggregates + the caller's own entries, computed in the DB instead
  // of loading every entry row of every open prediction on each request (#audit3 P2).
  const activeIds = active.map((p) => p.id);
  const [agg, myEntries] = await Promise.all([
    activeIds.length
      ? prisma.predictionEntry.groupBy({
          by: ["predictionId", "optionIndex"],
          where: { predictionId: { in: activeIds } },
          _sum: { tokensWagered: true },
          _count: { _all: true },
        })
      : [],
    userId && activeIds.length
      ? prisma.predictionEntry.findMany({
          where: { predictionId: { in: activeIds }, userId },
          select: { predictionId: true, optionIndex: true, tokensWagered: true },
        })
      : [],
  ]);
  const aggByPred = new Map<string, Map<number, { sum: number; count: number }>>();
  for (const g of agg) {
    let m = aggByPred.get(g.predictionId);
    if (!m) { m = new Map(); aggByPred.set(g.predictionId, m); }
    m.set(g.optionIndex, { sum: g._sum.tokensWagered ?? 0, count: g._count._all });
  }
  const myByPred = new Map(myEntries.map((e) => [e.predictionId, e]));

  return NextResponse.json({
    me: userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } }).then((u) => ({ tokens: u?.tokens ?? 0 }))
      : null,
    active: active.map((p) => {
      const optAgg = aggByPred.get(p.id);
      const perOption = p.options.map((label, idx) => {
        const a = optAgg?.get(idx);
        return { index: idx, label, totalWagered: a?.sum ?? 0, wagerCount: a?.count ?? 0 };
      });
      const myEntry = myByPred.get(p.id) ?? null;
      return {
        id: p.id,
        question: p.question,
        status: p.status,
        options: perOption,
        totalPot: p.totalPot,
        opensAt: p.opensAt.toISOString(),
        closesAt: p.closesAt?.toISOString() ?? null,
        myEntry: myEntry
          ? { optionIndex: myEntry.optionIndex, tokensWagered: myEntry.tokensWagered }
          : null,
      };
    }),
    recent: recent.map((p) => {
      const myEntry = "entries" in p && Array.isArray(p.entries) ? p.entries[0] : null;
      return {
        id: p.id,
        question: p.question,
        status: p.status,
        options: p.options,
        resolvedOptionIndex: p.resolvedOptionIndex,
        totalPot: p.totalPot,
        resolvedAt: p.resolvedAt?.toISOString() ?? null,
        myResult: myEntry
          ? {
              optionIndex: myEntry.optionIndex,
              tokensWagered: myEntry.tokensWagered,
              payout: myEntry.payout,
              won: myEntry.payout > myEntry.tokensWagered,
            }
          : null,
      };
    }),
  });
}
