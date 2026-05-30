// src/app/api/bot/chat-commands/route.ts
// PUBLIC GET — ghost-empire-chat fetches the enabled chat commands periodically
// (mirrors /api/bot/config). Only enabled commands are returned; an empty list
// means "no commands" (the bot respects that and keeps a fallback only on fetch error).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const commands = await prisma.chatCommand.findMany({
    where: { enabled: true },
    orderBy: { trigger: "asc" },
    select: { trigger: true, response: true, cooldownSeconds: true },
  });
  return NextResponse.json({ commands });
}
