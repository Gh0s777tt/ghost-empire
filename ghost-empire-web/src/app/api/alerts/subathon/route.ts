// src/app/api/alerts/subathon/route.ts
// Token-gated public feed for the OBS subathon overlay. Returns the countdown
// target + server time so the client can render a drift-corrected countdown.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const s = await prisma.subathon.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    active: s?.active ?? false,
    endsAt: s?.endsAt?.toISOString() ?? null,
    accentColor: s?.accentColor ?? "#E50914",
    label: s?.label ?? "Subathon",
    serverNow: new Date().toISOString(),
  });
}
