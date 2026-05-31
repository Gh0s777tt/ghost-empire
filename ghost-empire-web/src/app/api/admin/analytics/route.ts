// src/app/api/admin/analytics/route.ts
// Chat activity heatmap — 7×24 grid (day-of-week × hour, Europe/Warsaw) of how many
// chatter-minutes landed in each slot (incremented by /api/internal/chat-award).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const buckets = await prisma.chatActivityBucket.findMany();
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
  return NextResponse.json({ grid, total, peak });
}
