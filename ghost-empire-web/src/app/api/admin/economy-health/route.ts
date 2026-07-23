// src/app/api/admin/economy-health/route.ts
// GT economy-health snapshot for /admin#economy — circulating supply + the
// last-30-days mint/burn balance and the top GT sources (faucets) and sinks.
// Tenant-scoped through the user relation (Transaction is user-owned). Aggregated
// in the DB (aggregate + groupBy), never loading raw rows.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { economyHealth } from "@/lib/economy-health";
import { displayNick } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const TOP_N = 8;
const TREND_DAYS = 14;
const TREND_TX_CAP = 20000; // bound the lightweight 2-column read for the daily buckets

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const userWhere = tid ? { tenantId: tid } : undefined;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // currency:"GT" only — "economy health" reflects the REAL GT economy; casino chips are a
  // separate closed loop and must not inflate mint/spend/reason stats. (docs/CHIPS-CASINO.md)
  const txWhere = { currency: "GT", createdAt: { gte: since }, ...(userWhere ? { user: userWhere } : {}) };

  const trendSince = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);
  const trendWhere = { currency: "GT", createdAt: { gte: trendSince }, ...(userWhere ? { user: userWhere } : {}) };

  const [circAgg, mintedAgg, burnedAgg, byReason, trendTxs, topEarnRows, topSpendRows] = await Promise.all([
    prisma.user.aggregate({ _sum: { tokens: true }, where: userWhere }),
    prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...txWhere, amount: { gt: 0 } } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...txWhere, amount: { lt: 0 } } }),
    prisma.transaction.groupBy({ by: ["reason"], _sum: { amount: true }, _count: { _all: true }, where: txWhere }),
    // Daily trend: a lightweight 2-column read bucketed in JS (bounded + cheap at
    // this scale; date-truncation isn't expressible in a Prisma groupBy).
    prisma.transaction.findMany({ where: trendWhere, select: { amount: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: TREND_TX_CAP }),
    prisma.transaction.groupBy({ by: ["userId"], _sum: { amount: true }, where: { ...txWhere, amount: { gt: 0 } }, orderBy: { _sum: { amount: "desc" } }, take: 5 }),
    prisma.transaction.groupBy({ by: ["userId"], _sum: { amount: true }, where: { ...txWhere, amount: { lt: 0 } }, orderBy: { _sum: { amount: "asc" } }, take: 5 }),
  ]);

  const minted = mintedAgg._sum.amount ?? 0;
  const burned = Math.abs(burnedAgg._sum.amount ?? 0);

  // Bucket the trend into one slot per day (zero-filled so the chart has no gaps).
  const buckets = new Map<string, { earned: number; spent: number }>();
  for (let i = TREND_DAYS - 1; i >= 0; i--) buckets.set(dayKey(new Date(Date.now() - i * 86_400_000)), { earned: 0, spent: 0 });
  for (const tx of trendTxs) {
    const b = buckets.get(dayKey(tx.createdAt));
    if (!b) continue;
    if (tx.amount > 0) b.earned += tx.amount; else b.spent += -tx.amount;
  }
  const daily = [...buckets.entries()].map(([date, v]) => ({ date, earned: v.earned, spent: v.spent }));

  // Resolve display names for the top earners/spenders.
  const userIds = [...new Set([...topEarnRows, ...topSpendRows].map((r) => r.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, displayName: true, image: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: string) => { const u = byId.get(id); return { name: displayNick(u?.displayName, u?.username), image: u?.image ?? null }; };
  const topEarners = topEarnRows.map((r) => ({ ...nameOf(r.userId), amount: r._sum.amount ?? 0 }));
  const topSpenders = topSpendRows.map((r) => ({ ...nameOf(r.userId), amount: Math.abs(r._sum.amount ?? 0) }));

  const reasons = byReason.map((r) => ({ reason: r.reason, total: r._sum.amount ?? 0, count: r._count._all }));
  const sources = reasons
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);
  const sinks = reasons
    .filter((r) => r.total < 0)
    .map((r) => ({ ...r, total: Math.abs(r.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    circulating: circAgg._sum.tokens ?? 0,
    minted,
    burned,
    net: minted - burned,
    txCount: (mintedAgg._count._all ?? 0) + (burnedAgg._count._all ?? 0),
    health: economyHealth(minted, burned),
    sources,
    sinks,
    trendDays: TREND_DAYS,
    daily,
    topEarners,
    topSpenders,
  });
}
