// src/app/api/alerts/goals/route.ts
// Token-gated public feed for the OBS overlay. Returns currently-active goals + hype train state.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken, getSettings } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [goals, hype, settings] = await Promise.all([
    prisma.streamGoal.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    prisma.hypeTrainState.findUnique({ where: { id: "default" } }),
    getSettings(),
  ]);

  return NextResponse.json({
    accentColor: settings.accentColor,
    goals: goals.map((g) => ({
      id: g.id,
      type: g.type,
      label: g.label,
      current: g.current,
      target: g.target,
      color: g.color,
      completedAt: g.completedAt?.toISOString() ?? null,
    })),
    hypeTrain: hype && hype.active
      ? {
          level: hype.level,
          goal: hype.goal,
          total: hype.total,
          topContributor: hype.topContributor,
          expiresAt: hype.expiresAt?.toISOString() ?? null,
        }
      : null,
  });
}
