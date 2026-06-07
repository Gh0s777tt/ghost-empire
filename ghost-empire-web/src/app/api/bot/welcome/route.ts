// src/app/api/bot/welcome/route.ts
// PUBLIC GET — ghost-empire-chat fetches the welcome config periodically.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  // Tenant from the request Host (the bot calls the tenant's subdomain); legacy
  // id:"default" when there's no tenant (single-tenant / pre-backfill).
  const tid = await currentTenantId();
  const config = tid
    ? await prisma.welcomeConfig.findFirst({ where: { tenantId: tid } })
    : await prisma.welcomeConfig.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    enabled: config?.enabled ?? false,
    template: config?.template ?? "Witaj {user}! Miło Cię widzieć 👋",
    bonusTokens: config?.bonusTokens ?? 0,
  });
}
