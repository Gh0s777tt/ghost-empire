// src/app/api/internal/emoji-combo/route.ts
// Bot-only (BOT_SECRET): the chat bot POSTs a detected emoji combo here. Stored as
// one row per tenant (legacy singleton id "default"); the /overlay/emoji-combo
// source reads it (fresh-only).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { verifyBotSecret } from "@/lib/utils";

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Multi-tenant bot calls the tenant's subdomain, so Host-resolve is correct;
  // null = legacy single-tenant bot.
  const tid = await currentTenantId();

  let body: { emoji?: unknown; count?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emoji = String(body.emoji ?? "").slice(0, 16);
  const count = Math.max(0, Math.min(100_000, Math.floor(Number(body.count) || 0)));
  if (!emoji || count <= 0) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  await (tid
    ? prisma.emojiComboState.upsert({
        where: { tenantId: tid },
        create: { tenantId: tid, emoji, count },
        update: { emoji, count },
      })
    : prisma.emojiComboState.upsert({
        where: { id: "default" },
        create: { id: "default", emoji, count },
        update: { emoji, count },
      }));
  return NextResponse.json({ ok: true });
}
