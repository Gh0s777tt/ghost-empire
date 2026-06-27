// src/app/api/watch-streak/route.ts
// Watch Streaks + Loyalty (#687). GET = current status; POST = claim today's watch day.
// All logic + double-claim safety lives in lib/watch-streak (mirrors /api/daily-bonus).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWatchStreakStatus, claimWatchDay } from "@/lib/watch-streak";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getWatchStreakStatus(session.user.id));
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await claimWatchDay(session.user.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, reward: r.reward, streak: r.streak, tier: r.tier, newBalance: r.newBalance });
}
