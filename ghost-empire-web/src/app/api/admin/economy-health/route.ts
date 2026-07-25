// src/app/api/admin/economy-health/route.ts
// Economy-health snapshot for /admin#economy — circulating supply + the last-30-days
// mint/burn balance and the top sources (faucets) and sinks, for BOTH ledger loops:
// real GT and the free casino CHIPS, reported side by side but never summed together
// (docs/CHIPS-CASINO.md). Tenant-scoped through the user relation (Transaction is
// user-owned). Aggregated in the DB (aggregate + groupBy), never loading raw rows —
// the currency is a groupBy key, so covering both loops costs no extra queries.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { economyHealth, flowForCurrency, splitSourcesSinks, type CurrencyFlowRow, type ReasonFlow } from "@/lib/economy-health";
import { normalizeShopCurrency } from "@/lib/shop-currency";
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
  // Both loops in one window read: `currency` is a groupBy key rather than a filter, so the
  // GT and CHIPS numbers come from the SAME query and are split in memory afterwards. The
  // two are never added together — chips are free, so mixing them would report giveaways as
  // real economic activity (docs/CHIPS-CASINO.md).
  const txWhere = { createdAt: { gte: since }, ...(userWhere ? { user: userWhere } : {}) };

  // The trend chart and the top earners/spenders stay REAL GT only: they answer
  // "is the portal's economy healthy / who moves it", which chips (a closed, value-less
  // casino loop) would only blur.
  const trendSince = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);
  const gtOnly = { currency: "GT" };
  const trendWhere = { ...gtOnly, createdAt: { gte: trendSince }, ...(userWhere ? { user: userWhere } : {}) };
  const gtTxWhere = { ...txWhere, ...gtOnly };

  const [circAgg, mintedRows, burnedRows, byReason, trendTxs, topEarnRows, topSpendRows] = await Promise.all([
    // One aggregate covers both wallets.
    prisma.user.aggregate({ _sum: { tokens: true, chips: true }, where: userWhere }),
    prisma.transaction.groupBy({ by: ["currency"], _sum: { amount: true }, _count: { _all: true }, where: { ...txWhere, amount: { gt: 0 } } }),
    prisma.transaction.groupBy({ by: ["currency"], _sum: { amount: true }, _count: { _all: true }, where: { ...txWhere, amount: { lt: 0 } } }),
    prisma.transaction.groupBy({ by: ["currency", "reason"], _sum: { amount: true }, _count: { _all: true }, where: txWhere }),
    // Daily trend: a lightweight 2-column read bucketed in JS (bounded + cheap at
    // this scale; date-truncation isn't expressible in a Prisma groupBy).
    prisma.transaction.findMany({ where: trendWhere, select: { amount: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: TREND_TX_CAP }),
    prisma.transaction.groupBy({ by: ["userId"], _sum: { amount: true }, where: { ...gtTxWhere, amount: { gt: 0 } }, orderBy: { _sum: { amount: "desc" } }, take: 5 }),
    prisma.transaction.groupBy({ by: ["userId"], _sum: { amount: true }, where: { ...gtTxWhere, amount: { lt: 0 } }, orderBy: { _sum: { amount: "asc" } }, take: 5 }),
  ]);

  // Normalise the groupBy shape once, then slice per currency.
  const toFlowRows = (rows: { currency: string; _sum: { amount: number | null }; _count: { _all: number } }[]): CurrencyFlowRow[] =>
    rows.map((r) => ({ currency: r.currency, total: r._sum.amount ?? 0, count: r._count._all }));
  const mintedFlow = toFlowRows(mintedRows);
  const burnedFlow = toFlowRows(burnedRows);

  const gtMinted = flowForCurrency(mintedFlow, "GT");
  const gtBurned = flowForCurrency(burnedFlow, "GT");
  const chipsMinted = flowForCurrency(mintedFlow, "CHIPS");
  const chipsBurned = flowForCurrency(burnedFlow, "CHIPS");

  const minted = gtMinted.total;
  const burned = Math.abs(gtBurned.total);

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

  // Per-reason buckets arrive tagged with their currency; keep the two loops apart.
  const reasonsFor = (currency: "GT" | "CHIPS"): ReasonFlow[] =>
    byReason
      .filter((r) => normalizeShopCurrency(r.currency) === currency)
      .map((r) => ({ reason: r.reason, total: r._sum.amount ?? 0, count: r._count._all }));

  const { sources, sinks } = splitSourcesSinks(reasonsFor("GT"), TOP_N);
  const chips = splitSourcesSinks(reasonsFor("CHIPS"), TOP_N);
  const chipsMintedTotal = chipsMinted.total;
  const chipsBurnedTotal = Math.abs(chipsBurned.total);

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    circulating: circAgg._sum.tokens ?? 0,
    minted,
    burned,
    net: minted - burned,
    txCount: gtMinted.count + gtBurned.count,
    health: economyHealth(minted, burned),
    sources,
    sinks,
    trendDays: TREND_DAYS,
    daily,
    topEarners,
    topSpenders,
    // The second, deliberately separate loop. Same shape as the GT block minus the trend
    // and the top-user lists (a "luckiest gambler" ranking isn't an economy signal); the
    // client hides the whole block when the portal has no chips activity at all.
    chips: {
      circulating: circAgg._sum.chips ?? 0,
      minted: chipsMintedTotal,
      burned: chipsBurnedTotal,
      net: chipsMintedTotal - chipsBurnedTotal,
      txCount: chipsMinted.count + chipsBurned.count,
      health: economyHealth(chipsMintedTotal, chipsBurnedTotal),
      sources: chips.sources,
      sinks: chips.sinks,
    },
  });
}
