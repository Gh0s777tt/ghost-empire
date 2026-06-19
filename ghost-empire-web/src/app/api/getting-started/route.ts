// src/app/api/getting-started/route.ts
// Completion flags for the home "getting started" checklist — surfaces the core
// loop to new viewers (link a platform, claim the daily bonus, join a clan, vote
// on a clip). Cheap reads; no writes. Returns all-false shape for guests.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isoWeekKey } from "@/lib/twitch-clips";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ steps: { platform: false, daily: false, clan: false, clip: false } });
  }
  const userId = session.user.id;
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const week = isoWeekKey(now);

  const [connCount, user, dailyToday, clipVote] = await Promise.all([
    prisma.connection.count({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { clanId: true } }),
    prisma.transaction.findFirst({ where: { userId, reason: "daily-bonus", createdAt: { gte: dayStart } }, select: { id: true } }),
    prisma.clipVote.findUnique({ where: { userId_week: { userId, week } }, select: { id: true } }),
  ]);

  return NextResponse.json({
    steps: {
      platform: connCount > 0,
      daily: dailyToday != null,
      clan: user?.clanId != null,
      clip: clipVote != null,
    },
  });
}
