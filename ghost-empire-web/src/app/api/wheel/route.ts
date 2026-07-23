// src/app/api/wheel/route.ts
// Public-ish wheel state for the /wheel page: config (cost + segments), the
// logged-in user's balance, and a short feed of recent winners.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWheelConfig } from "@/lib/wheel";
import { currentTenantId } from "@/lib/tenant";
import { displayNick } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const [cfg, session] = await Promise.all([getWheelConfig(), auth()]);

  let balance: number | null = null;
  if (session?.user?.id) {
    const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { chips: true } });
    balance = u?.chips ?? 0;
  }

  // Scope the winners feed to THIS portal (WheelSpin is user-owned → via user.tenantId),
  // so one tenant's wheel never shows another tenant's players.
  const tid = await currentTenantId();
  const recent = await prisma.wheelSpin.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    where: { rewardTokens: { gt: 0 }, ...(tid ? { user: { tenantId: tid } } : {}) }, // only show wins in the feed
    include: { user: { select: { username: true, displayName: true } } },
  });

  return NextResponse.json({
    enabled: cfg.enabled,
    costPerSpin: cfg.costPerSpin,
    // Don't leak weights to the client — only what's needed to draw the wheel.
    segments: cfg.segments.map((s) => ({ label: s.label, rewardTokens: s.rewardTokens, color: s.color })),
    balance,
    recentWins: recent.map((r) => ({
      id: r.id,
      name: displayNick(r.user.displayName, r.user.username),
      label: r.segmentLabel,
      reward: r.rewardTokens,
      at: r.createdAt.toISOString(),
    })),
  });
}
