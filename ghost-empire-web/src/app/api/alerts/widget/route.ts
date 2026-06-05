// src/app/api/alerts/widget/route.ts
// Token-gated feed for a single custom widget (by id), consumed by /overlay/widget.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const id = url.searchParams.get("id");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const w = await prisma.customWidget.findUnique({ where: { id } });
  if (!w) return NextResponse.json({ exists: false });

  return NextResponse.json({
    exists: true,
    text: w.text,
    accentColor: w.accentColor,
    textColor: w.textColor,
    fontSizePx: w.fontSizePx,
    fontFamily: w.fontFamily,
    position: w.position,
    showCard: w.showCard,
    bgGradient: w.bgGradient,
    bgColor1: w.bgColor1,
    bgColor2: w.bgColor2,
    bgAngle: w.bgAngle,
  });
}
