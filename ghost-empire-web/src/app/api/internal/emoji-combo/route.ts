// src/app/api/internal/emoji-combo/route.ts
// Bot-only (BOT_SECRET): the chat bot POSTs a detected emoji combo here. Stored as a
// singleton; the /overlay/emoji-combo source reads it (fresh-only).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { emoji?: unknown; count?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emoji = String(body.emoji ?? "").slice(0, 16);
  const count = Math.max(0, Math.min(100_000, Math.floor(Number(body.count) || 0)));
  if (!emoji || count <= 0) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  await prisma.emojiComboState.upsert({
    where: { id: "default" },
    create: { id: "default", emoji, count },
    update: { emoji, count },
  });
  return NextResponse.json({ ok: true });
}
