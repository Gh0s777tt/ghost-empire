// src/app/api/bot/active-prediction/route.ts
// Public GET consumed by the chat bot to periodically re-announce the open prediction
// ("auto-pin" emulation — Twitch/Kick have no public pin API, so the bot re-posts a
// reminder while a bet is open). Returns the most recent OPEN prediction only.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { lockExpiredPredictions } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export async function GET() {
  // Auto-close first so an expired bet stops being re-announced.
  await lockExpiredPredictions();

  const tid = await currentTenantId();
  const p = await prisma.prediction.findFirst({
    where: { status: "open", announceToChat: true, ...(tid ? { tenantId: tid } : {}) },
    orderBy: { opensAt: "desc" },
    select: { id: true, question: true, options: true, totalPot: true },
  });
  if (!p) return NextResponse.json({ active: false });
  return NextResponse.json({
    active: true,
    id: p.id,
    question: p.question,
    optionsCount: p.options.length,
    totalPot: p.totalPot,
  });
}
