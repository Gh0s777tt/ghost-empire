// src/app/api/companion/season/route.ts
// Read-only: aktualny AKTYWNY sezon (battle pass) + postęp usera (tier/xp/premium).
// Auth: sesja LUB companion bearer token (jak /api/companion). NIGDY nie pisze —
// odpytuje aktywny sezon (NIE create-on-read); brak sezonu → { season: null }.
// Multi-tenant: tenant przed auth, token musi być z tego portalu.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { bearerFromRequest, verifyCompanionToken } from "@/lib/companion-token";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const tenant = await getCurrentTenant();
  const tid = tenant.id;

  const session = await auth();
  let userId = session?.user?.id ?? null;
  if (!userId) {
    const payload = verifyCompanionToken(bearerFromRequest(req));
    if (payload && payload.tenantId === tid) userId = payload.userId;
  }
  if (!userId) return jsonError("Musisz być zalogowany", 401);

  const season = await prisma.season.findFirst({
    where: { active: true, ...(tid ? { tenantId: tid } : {}) },
    select: { id: true, number: true, name: true, totalTiers: true, xpPerTier: true, endsAt: true },
    orderBy: { number: "desc" },
  });
  if (!season) return NextResponse.json({ season: null }, { headers: CORS });

  const progress = await prisma.userSeasonProgress.findFirst({
    where: { userId, seasonId: season.id },
    select: { xp: true, tier: true, premium: true },
  });
  const xp = progress?.xp ?? 0;
  const xpIntoTier = season.xpPerTier > 0 ? xp % season.xpPerTier : 0;

  return NextResponse.json(
    {
      season: {
        number: season.number,
        name: season.name,
        totalTiers: season.totalTiers,
        xpPerTier: season.xpPerTier,
        endsAt: season.endsAt.toISOString(),
      },
      progress: {
        xp,
        tier: progress?.tier ?? 0,
        premium: progress?.premium ?? false,
        xpIntoTier,
        xpToNextTier: Math.max(0, season.xpPerTier - xpIntoTier),
      },
    },
    { headers: CORS },
  );
}
