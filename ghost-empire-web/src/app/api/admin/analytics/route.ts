// src/app/api/admin/analytics/route.ts
// Analytics:
//   - Chat activity heatmap — 7×24 grid (day-of-week × hour, Europe/Warsaw) of how many
//     chatter-minutes landed in each slot (incremented by /api/internal/chat-award).
//   - Stream sessions ("czas na streamie") — broadcasts opened/closed by Twitch EventSub
//     stream.online/offline; total broadcast time, count, current live status.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Batch B: stream sessions scope to this tenant (null → unscoped, back-compat).
  // The chat-activity heatmap stays global for now — tenant-scoping it needs a
  // destructive PK change (composite [dayOfWeek,hour]); deferred to subdomain-enable.
  const tid = await currentTenantId();
  const scope = tid ? { tenantId: tid } : {};
  const [buckets, recentSessions, agg] = await Promise.all([
    prisma.chatActivityBucket.findMany(),
    prisma.streamSession.findMany({ where: scope, orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.streamSession.aggregate({ where: scope, _sum: { durationSeconds: true }, _count: { _all: true } }),
  ]);

  const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let total = 0;
  let peak = 0;
  for (const b of buckets) {
    if (b.dayOfWeek >= 0 && b.dayOfWeek < 7 && b.hour >= 0 && b.hour < 24) {
      grid[b.dayOfWeek][b.hour] = b.count;
      total += b.count;
      if (b.count > peak) peak = b.count;
    }
  }

  const live = recentSessions.find((s) => s.endedAt === null) ?? null;

  return NextResponse.json({
    grid, total, peak,
    streams: {
      live: live ? { startedAt: live.startedAt.toISOString() } : null,
      totalSeconds: agg._sum.durationSeconds ?? 0,
      count: agg._count._all,
      recent: recentSessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        durationSeconds: s.durationSeconds,
      })),
    },
  });
}
