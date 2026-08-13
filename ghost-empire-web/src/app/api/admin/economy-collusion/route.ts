// src/app/api/admin/economy-collusion/route.ts
// Admin-only sockpuppet/collusion scan for /admin#economy: ranks the clearest multi-account abuse
// patterns in the USER-side economy (referral farming, duel wash-trading, gift collectors) from the
// data we already have. Tenant-scoped through each model's tenant boundary. Pure detection lives in
// @/lib/economy-collusion; this route only aggregates the DB reads and resolves display names.
// v1 = flags for a human to review — no auto-hold/ban (that stays a deliberate admin action).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { displayNick } from "@/lib/utils";
import {
  flagReferralStars, flagDuelCollusion, flagGiftConcentration, pairKey,
  type ReferrerRow, type DuelPairRow, type GiftUserRow,
} from "@/lib/economy-collusion";

export const dynamic = "force-dynamic";

const LOW_ACTIVITY_TOKENS = 200; // a referred account below this + level ≤ 1 reads as inert (farmed)
const DUEL_LOOKBACK_DAYS = 90;
const DUEL_CAP = 20000; // bound the resolved-duel read; older/overflow duels are noted, not silently dropped

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const userWhere = tid ? { tenantId: tid } : {};
  const duelSince = new Date(Date.now() - DUEL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [referredUsers, duels, giftRows] = await Promise.all([
    // Referral graph: every referred account in this portal + the cheap "is it inert?" signal.
    prisma.user.findMany({
      where: { referredById: { not: null }, ...userWhere },
      select: { referredById: true, level: true, tokens: true },
    }),
    // Resolved, two-party duels in the window (open/cancelled/expired carry no result to collude on).
    prisma.duel.findMany({
      where: { status: "resolved", opponentId: { not: null }, resolvedAt: { gte: duelSince }, ...(tid ? { tenantId: tid } : {}) },
      select: { challengerId: true, opponentId: true, winnerId: true },
      orderBy: { resolvedAt: "desc" },
      take: DUEL_CAP,
    }),
    // Gift flows per user (sender rows negative, recipient rows positive), tenant-scoped via relation.
    prisma.transaction.groupBy({
      by: ["userId", "reason"],
      where: { reason: { in: ["gift_sent", "gift_received"] }, ...(tid ? { user: { tenantId: tid } } : {}) },
      _sum: { amount: true },
    }),
  ]);

  // --- Referral stars: group referred accounts by their referrer, count the inert ones. ---
  const refMap = new Map<string, { referredCount: number; lowActivityCount: number }>();
  for (const u of referredUsers) {
    const r = u.referredById as string;
    const e = refMap.get(r) ?? { referredCount: 0, lowActivityCount: 0 };
    e.referredCount++;
    if (u.level <= 1 && u.tokens < LOW_ACTIVITY_TOKENS) e.lowActivityCount++;
    refMap.set(r, e);
  }
  const referrerRows: ReferrerRow[] = [...refMap.entries()].map(([referrerId, v]) => ({ referrerId, ...v }));
  const referralStars = flagReferralStars(referrerRows);

  // --- Duel collusion: aggregate resolved duels per unordered pair. ---
  const pairMap = new Map<string, DuelPairRow>();
  for (const d of duels) {
    if (!d.opponentId) continue;
    const { a, b, key } = pairKey(d.challengerId, d.opponentId);
    const e = pairMap.get(key) ?? { a, b, total: 0, aWins: 0, bWins: 0 };
    e.total++;
    if (d.winnerId === a) e.aWins++;
    else if (d.winnerId === b) e.bWins++; // a draw/null winner counts toward volume, neither win
    pairMap.set(key, e);
  }
  const duelCollusion = flagDuelCollusion([...pairMap.values()]);

  // --- Gift collectors: fold the per-(user,reason) sums into sent/received, then bring in earned. ---
  const giftMap = new Map<string, { sent: number; received: number }>();
  for (const g of giftRows) {
    const e = giftMap.get(g.userId) ?? { sent: 0, received: 0 };
    const amt = g._sum.amount ?? 0;
    if (g.reason === "gift_sent") e.sent += Math.abs(amt);
    else e.received += amt;
    giftMap.set(g.userId, e);
  }
  const giftEarned = giftMap.size
    ? new Map((await prisma.user.findMany({ where: { id: { in: [...giftMap.keys()] } }, select: { id: true, totalEarned: true } })).map((u) => [u.id, u.totalEarned]))
    : new Map<string, number>();
  const giftRowsAgg: GiftUserRow[] = [...giftMap.entries()].map(([userId, v]) => ({ userId, sent: v.sent, received: v.received, earnedTotal: giftEarned.get(userId) ?? 0 }));
  const giftCollectors = flagGiftConcentration(giftRowsAgg);

  // --- Resolve display names for every flagged id in one query. ---
  const ids = new Set<string>();
  referralStars.forEach((f) => ids.add(f.referrerId));
  duelCollusion.forEach((f) => { ids.add(f.a); ids.add(f.b); });
  giftCollectors.forEach((f) => ids.add(f.userId));
  const users = ids.size
    ? await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, username: true, displayName: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, displayNick(u.displayName, u.username)]));
  const nameOf = (id: string) => nameById.get(id) ?? id.slice(0, 8);

  return NextResponse.json({
    referralStars: referralStars.map((f) => ({ ...f, referrerName: nameOf(f.referrerId) })),
    duelCollusion: duelCollusion.map((f) => ({ ...f, aName: nameOf(f.a), bName: nameOf(f.b), winnerName: nameOf(f.winner) })),
    giftCollectors: giftCollectors.map((f) => ({ ...f, name: nameOf(f.userId) })),
    meta: { duelsScanned: duels.length, duelWindowDays: DUEL_LOOKBACK_DAYS, duelCapReached: duels.length >= DUEL_CAP },
  });
}
