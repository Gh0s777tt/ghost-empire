// src/app/api/admin/subscribers/route.ts
// Subscriber roster (#701) — every linked account currently flagged as a platform subscriber
// (Twitch/Kick/YouTube sub), so the owner can verify & control who's subscribed (sub-gated
// shop items, perks). Read-only, admin-gated, tenant-scoped (Connection → user.tenantId).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = auth.tenantId;
  const rows = await prisma.connection.findMany({
    where: { isSubscriber: true, ...(tid ? { user: { tenantId: tid } } : {}) },
    select: {
      platform: true,
      username: true,
      subTier: true,
      subMonths: true,
      isModerator: true,
      isVip: true,
      isOG: true,
      user: { select: { id: true, username: true, displayName: true, image: true } },
    },
    orderBy: [{ subMonths: "desc" }],
    take: 1000,
  });

  const byPlatform: Record<string, number> = {};
  for (const r of rows) byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1;

  return NextResponse.json({
    total: rows.length,
    byPlatform,
    subscribers: rows.map((r) => ({
      platform: r.platform,
      handle: r.username,
      subTier: r.subTier,
      subMonths: r.subMonths,
      isModerator: r.isModerator,
      isVip: r.isVip,
      isOG: r.isOG,
      userId: r.user.id,
      username: r.user.username,
      displayName: r.user.displayName,
      image: r.user.image,
    })),
  });
}
