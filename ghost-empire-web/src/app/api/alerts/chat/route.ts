// src/app/api/alerts/chat/route.ts
// Token-gated public feed for the OBS chat overlay. Returns the most recent
// messages (oldest → newest) from all platforms. Mirrors /api/alerts/goals.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const LIMIT = 40;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.chatFeedMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: LIMIT,
  });

  return NextResponse.json({
    messages: rows
      .reverse()
      .map((m) => ({
        id: m.id,
        platform: m.platform,
        username: m.username,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      })),
  });
}
