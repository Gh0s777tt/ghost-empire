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
  const [commands, openSession] = await Promise.all([
    prisma.chatCommand.findMany({
      where: { enabled: true, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
      orderBy: { trigger: "asc" },
      select: { trigger: true, response: true, cooldownSeconds: true, requiresLive: true, activeFromMinute: true },
    }),
    prisma.streamSession.findFirst({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);
  return NextResponse.json({
    commands,
    live: !!openSession,
    liveSince: openSession?.startedAt.toISOString() ?? null,
  });
}
