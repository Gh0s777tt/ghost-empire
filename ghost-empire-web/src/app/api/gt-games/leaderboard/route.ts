// src/app/api/gt-games/leaderboard/route.ts
// Public: biggest single GT-game wins + top net winners (last 30 days).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { displayNick } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Scope to THIS portal (GtGamePlay is user-owned → via user.tenantId), so the
  // casino leaderboard never mixes players from different tenants.
  const tid = await currentTenantId();
  const scope = tid ? { user: { tenantId: tid } } : {};

  const [bigWins, topNet] = await Promise.all([
    prisma.gtGamePlay.findMany({
      where: { payout: { gt: 0 }, createdAt: { gte: since }, ...scope },
      orderBy: { net: "desc" },
      take: 10,
      include: { user: { select: { username: true, displayName: true } } },
    }),
    prisma.gtGamePlay.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since }, ...scope },
      _sum: { net: true },
      orderBy: { _sum: { net: "desc" } },
      take: 10,
    }),
  ]);

  const userIds = topNet.map((t) => t.userId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, displayName: true } });
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    bigWins: bigWins.map((w) => ({
      id: w.id,
      name: displayNick(w.user.displayName, w.user.username),
      game: w.game,
      net: w.net,
      detail: w.detail,
    })),
    topNet: topNet.map((t) => {
      const u = byId.get(t.userId);
      return { name: displayNick(u?.displayName, u?.username), net: t._sum.net ?? 0 };
    }),
  });
}
