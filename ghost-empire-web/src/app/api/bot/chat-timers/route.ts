// src/app/api/bot/chat-timers/route.ts
// PUBLIC GET — ghost-empire-chat fetches enabled cyclic timers periodically
// (mirrors /api/bot/chat-commands). The bot broadcasts each on its interval.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const tid = await currentTenantId();
  const timers = await prisma.chatTimer.findMany({
    where: { enabled: true, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, message: true, intervalSeconds: true },
  });
  return NextResponse.json({ timers });
}
