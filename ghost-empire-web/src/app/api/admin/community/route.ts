// src/app/api/admin/community/route.ts
// Read-only community stats for /admin#community — top Ghost Companions (by xp =
// lifetime GT fed) and top clans (by treasury), plus totals. Both surface the GT
// these social features SINK (counterpart to the economy-health dashboard).
// Tenant-scoped; aggregated in the DB.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { companionStage } from "@/lib/companion";
import { displayNick } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TOP_N = 10;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const companionWhere = tid ? { tenantId: tid } : {};
  const clanWhere = tid ? { tenantId: tid } : {};

  const [topCompanions, companionAgg, topClans, clanAgg] = await Promise.all([
    prisma.companion.findMany({
      where: { ...companionWhere, xp: { gt: 0 } },
      orderBy: { xp: "desc" },
      take: TOP_N,
      select: { name: true, xp: true, user: { select: { displayName: true, username: true } } },
    }),
    prisma.companion.aggregate({ where: companionWhere, _sum: { xp: true }, _count: { _all: true } }),
    prisma.clan.findMany({
      where: clanWhere,
      orderBy: { treasury: "desc" },
      take: TOP_N,
      select: { name: true, tag: true, treasury: true, _count: { select: { members: true } } },
    }),
    prisma.clan.aggregate({ where: clanWhere, _sum: { treasury: true }, _count: { _all: true } }),
  ]);

  return NextResponse.json({
    companions: {
      count: companionAgg._count._all,
      totalFed: companionAgg._sum.xp ?? 0,
      top: topCompanions.map((c) => ({
        name: c.name,
        xp: c.xp,
        owner: displayNick(c.user.displayName, c.user.username),
        emoji: companionStage(c.xp).emoji,
      })),
    },
    clans: {
      count: clanAgg._count._all,
      totalTreasury: clanAgg._sum.treasury ?? 0,
      top: topClans.map((c) => ({ name: c.name, tag: c.tag, treasury: c.treasury, members: c._count.members })),
    },
  });
}
