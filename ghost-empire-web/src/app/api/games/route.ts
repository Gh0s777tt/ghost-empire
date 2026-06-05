// src/app/api/games/route.ts
// Public game library — visible games, most-played first.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const games = await prisma.game.findMany({
    where: { hidden: false },
    orderBy: [{ playtimeMin: "desc" }, { name: "asc" }],
  });
  const totalMin = games.reduce((s, g) => s + g.playtimeMin, 0);

  return NextResponse.json({
    count: games.length,
    totalHours: Math.round(totalMin / 60),
    games: games.map((g) => ({
      id: g.id,
      source: g.source,
      name: g.name,
      imageUrl: g.imageUrl,
      hours: Math.round(g.playtimeMin / 60),
      lastPlayedAt: g.lastPlayedAt?.toISOString() ?? null,
    })),
  });
}
