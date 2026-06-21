// src/app/api/admin/mod-violations/route.ts
// Admin-only moderation stats: violation counts by type, 24h/7d totals, recent
// log, and the top repeat offenders.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const now = Date.now();
  const day = new Date(now - 24 * 60 * 60 * 1000);
  const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
  // Batch B: scope to this admin's tenant (null at single-tenant → unscoped, back-compat).
  const tid = await currentTenantId();
  const scope = tid ? { tenantId: tid } : {};

  const [byType, total24h, total7d, recent, offenders] = await Promise.all([
    prisma.modViolationLog.groupBy({
      by: ["violation"],
      where: { createdAt: { gte: week }, ...scope },
      _count: { _all: true },
    }),
    prisma.modViolationLog.count({ where: { createdAt: { gte: day }, ...scope } }),
    prisma.modViolationLog.count({ where: { createdAt: { gte: week }, ...scope } }),
    prisma.modViolationLog.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, platform: true, username: true, violation: true, action: true, priorCount: true, createdAt: true },
    }),
    prisma.modViolationLog.groupBy({
      by: ["platform", "username"],
      where: { createdAt: { gte: week }, ...scope },
      _count: { _all: true },
      orderBy: { _count: { username: "desc" } },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    byType: byType.map((b) => ({ violation: b.violation, count: b._count._all })),
    total24h,
    total7d,
    recent: recent.map((r) => ({
      id: r.id,
      platform: r.platform,
      username: r.username,
      violation: r.violation,
      action: r.action,
      priorCount: r.priorCount,
      at: r.createdAt.toISOString(),
    })),
    topOffenders: offenders.map((o) => ({ platform: o.platform, username: o.username, count: o._count._all })),
  });
}
