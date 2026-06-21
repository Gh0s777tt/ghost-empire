// src/app/api/bot/chat-commands/route.ts
// PUBLIC GET — ghost-empire-chat fetches the enabled chat commands periodically
// (mirrors /api/bot/config). Only enabled commands are returned; an empty list
// means "no commands" (the bot respects that and keeps a fallback only on fetch error).
//
// Also returns the current live status (from the open StreamSession opened by Twitch
// EventSub stream.online) so the bot can evaluate conditional commands — requiresLive /
// activeFromMinute — without polling Twitch itself.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const tid = await currentTenantId();
  const [commands, openSession, raffles] = await Promise.all([
    prisma.chatCommand.findMany({
      where: { enabled: true, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
      orderBy: { trigger: "asc" },
      select: { trigger: true, response: true, cooldownSeconds: true, requiresLive: true, activeFromMinute: true },
    }),
    prisma.streamSession.findFirst({
      where: { endedAt: null, ...(tid ? { tenantId: tid } : {}) },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    // Active keyword raffles (#611): the bot watches chat for these and reports hits to
    // /api/internal/raffle-entry. Same scope as the entry endpoint (tenant + legacy null,
    // not drawn, not expired).
    prisma.event.findMany({
      where: {
        type: "raffle", active: true, drawnAt: null, raffleKeyword: { not: null },
        AND: [
          ...(tid ? [{ OR: [{ tenantId: tid }, { tenantId: null }] }] : []),
          { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
        ],
      },
      select: { raffleKeyword: true },
    }),
  ]);
  const raffleKeywords = [...new Set(raffles.map((r) => r.raffleKeyword!.toLowerCase()))];
  return NextResponse.json({
    commands,
    live: !!openSession,
    liveSince: openSession?.startedAt.toISOString() ?? null,
    raffleKeywords,
  });
}
