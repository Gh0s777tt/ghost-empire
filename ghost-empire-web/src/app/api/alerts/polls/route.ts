// src/app/api/alerts/polls/route.ts
// Token-gated public feed for the OBS active-poll overlay. Returns the most recent
// open poll with per-option vote counts + accent color.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const p = await prisma.poll.findFirst({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    include: { votes: { select: { optionIndex: true } } },
  });

  if (!p) return NextResponse.json({ active: false });

  const options = p.options.map((label, idx) => ({
    label,
    count: p.votes.filter((v) => v.optionIndex === idx).length,
  }));

  return NextResponse.json({
    active: true,
    id: p.id,
    question: p.question,
    status: p.status,
    accentColor: p.accentColor,
    total: p.votes.length,
    options,
  });
}
