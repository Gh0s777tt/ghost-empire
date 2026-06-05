// src/app/api/alerts/predictions/route.ts
// Token-gated public feed for the OBS active-prediction overlay. Returns the most
// recent open/locked prediction with its per-option totals + accent color.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";
import { lockExpiredPredictions } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await lockExpiredPredictions();

  const p = await prisma.prediction.findFirst({
    where: { status: { in: ["open", "locked"] } },
    orderBy: { opensAt: "desc" },
    include: { entries: { select: { optionIndex: true, tokensWagered: true } } },
  });

  if (!p) return NextResponse.json({ active: false });

  const options = p.options.map((label, idx) => {
    const entries = p.entries.filter((e) => e.optionIndex === idx);
    return {
      label,
      total: entries.reduce((s, e) => s + e.tokensWagered, 0),
      count: entries.length,
    };
  });

  return NextResponse.json({
    active: true,
    id: p.id,
    question: p.question,
    status: p.status,
    accentColor: p.accentColor,
    totalPot: p.totalPot,
    options,
  });
}
