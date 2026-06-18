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

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const TOP_N = 8;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const userWhere = tid ? { tenantId: tid } : undefined;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const txWhere = { createdAt: { gte: since }, ...(userWhere ? { user: userWhere } : {}) };

  const [circAgg, mintedAgg, burnedAgg, byReason] = await Promise.all([
    prisma.user.aggregate({ _sum: { tokens: true }, where: userWhere }),
    prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...txWhere, amount: { gt: 0 } } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...txWhere, amount: { lt: 0 } } }),
    prisma.transaction.groupBy({ by: ["reason"], _sum: { amount: true }, _count: { _all: true }, where: txWhere }),
  ]);

  const minted = mintedAgg._sum.amount ?? 0;
  const burned = Math.abs(burnedAgg._sum.amount ?? 0);

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
  });
}
