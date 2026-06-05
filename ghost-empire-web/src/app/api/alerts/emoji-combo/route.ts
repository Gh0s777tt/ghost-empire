// src/app/api/alerts/emoji-combo/route.ts
// Token-gated feed for the emoji-combo OBS overlay. Returns the current combo only
// while it's fresh (the bot keeps updating it during a combo; it goes stale after).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const FRESH_MS = 5000;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const s = await prisma.emojiComboState.findUnique({ where: { id: "default" } });
  if (!s || !s.emoji || Date.now() - s.updatedAt.getTime() >= FRESH_MS) {
    return NextResponse.json({ active: false });
  }
  return NextResponse.json({ active: true, emoji: s.emoji, count: s.count, ts: s.updatedAt.getTime() });
}
