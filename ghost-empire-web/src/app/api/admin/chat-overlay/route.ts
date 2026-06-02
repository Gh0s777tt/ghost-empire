// src/app/api/admin/chat-overlay/route.ts
// Admin: read / save the chat overlay appearance (ChatOverlayConfig singleton).
// Applied live by /overlay/chat + the /admin#chat preview.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

const FONTS = ["Inter", "JetBrains Mono", "Anton", "system"];

async function getConfig() {
  return prisma.chatOverlayConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

function shape(c: { fontSize: number; textColor: string; fontFamily: string; bgOpacity: number; showPlatformIcon: boolean }) {
  return {
    fontSize: c.fontSize,
    textColor: c.textColor,
    fontFamily: c.fontFamily,
    bgOpacity: c.bgOpacity,
    showPlatformIcon: c.showPlatformIcon,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const c = await getConfig();
  return NextResponse.json({ config: shape(c) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.fontSize !== undefined) data.fontSize = Math.min(40, Math.max(10, Math.floor(Number(body.fontSize) || 15)));
  if (typeof body.textColor === "string") data.textColor = body.textColor.slice(0, 16);
  if (typeof body.fontFamily === "string" && FONTS.includes(body.fontFamily)) data.fontFamily = body.fontFamily;
  if (body.bgOpacity !== undefined) data.bgOpacity = Math.min(1, Math.max(0, Number(body.bgOpacity) || 0));
  if (typeof body.showPlatformIcon === "boolean") data.showPlatformIcon = body.showPlatformIcon;

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Brak zmian" }, { status: 400 });

  await getConfig(); // ensure exists
  const updated = await prisma.chatOverlayConfig.update({ where: { id: "default" }, data });
  return NextResponse.json({ ok: true, config: shape(updated) });
}
