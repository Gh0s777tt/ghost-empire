// src/app/api/gt-games/history/route.ts
// The signed-in player's personal casino history: last 12 plays + lifetime stats
// (games, wins, best win, net). Read-only, auth-gated; backed by the
// gt_game_plays(userId, createdAt) index.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [recent, agg, wins] = await Promise.all([
    prisma.gtGamePlay.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, game: true, bet: true, payout: true, net: true, detail: true, createdAt: true },
    }),
    prisma.gtGamePlay.aggregate({ where: { userId }, _count: true, _sum: { net: true }, _max: { net: true } }),
    prisma.gtGamePlay.count({ where: { userId, net: { gt: 0 } } }),
  ]);

  return NextResponse.json({
    recent,
    stats: {
      games: agg._count,
      wins,
      net: agg._sum.net ?? 0,
      best: Math.max(0, agg._max.net ?? 0),
    },
  });
}
