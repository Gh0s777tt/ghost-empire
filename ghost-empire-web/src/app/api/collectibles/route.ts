// src/app/api/collectibles/route.ts
// Public catalog of collectible cards + (if logged in) the viewer's owned quantities
// and GT balance. Tenant-scoped. Read-only.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { PACK_PRICE } from "@/lib/collectibles";

export const dynamic = "force-dynamic";

export async function GET() {
  // Independent reads — run them together instead of serially on the 3-connection pool. #audit-v2
  const [session, tid] = await Promise.all([auth(), currentTenantId()]);

  const cards = await prisma.collectible
    .findMany({
      where: { active: true, ...(tid ? { tenantId: tid } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, description: true, rarity: true, emoji: true, imageUrl: true },
    })
    .catch(() => []);

  let owned: Record<string, number> = {};
  let balance = 0;
  if (session?.user?.id) {
    const [mine, u] = await Promise.all([
      prisma.userCollectible.findMany({ where: { userId: session.user.id, collectibleId: { in: cards.map((c) => c.id) } }, select: { collectibleId: true, qty: true } }).catch(() => []),
      prisma.user.findUnique({ where: { id: session.user.id }, select: { tokens: true } }),
    ]);
    owned = Object.fromEntries(mine.map((m) => [m.collectibleId, m.qty]));
    balance = u?.tokens ?? 0;
  }

  return NextResponse.json({
    cards: cards.map((c) => ({ ...c, qty: owned[c.id] ?? 0 })),
    balance,
    packPrice: PACK_PRICE,
    loggedIn: !!session?.user?.id,
  });
}
