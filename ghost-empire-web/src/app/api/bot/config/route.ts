// src/app/api/bot/config/route.ts
// PUBLIC GET — bot fetches its config periodically.
// Returns defaults if no DB row yet (first run).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export async function GET() {
  // Tenant from the request Host (the bot calls the tenant's subdomain); legacy
  // id:"default" when there's no tenant (single-tenant / pre-backfill).
  const tid = await currentTenantId();
  const config = tid
    ? await prisma.botConfig.findFirst({ where: { tenantId: tid } })
    : await prisma.botConfig.findUnique({ where: { id: "default" } });
  if (config) return NextResponse.json(config);

  // No row yet → return defaults (matches schema defaults)
  return NextResponse.json({
    id: "default",
    messageReward: 5,
    messageCooldownSeconds: 60,
    voiceRewardPerMinute: 10,
    voiceTickSeconds: 60,
    afkGivesReward: false,
    mutedGivesReward: true,
    enabled: true,
    updatedAt: new Date(),
  });
}
