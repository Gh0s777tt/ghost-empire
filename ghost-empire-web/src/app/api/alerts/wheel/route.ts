// src/app/api/alerts/wheel/route.ts
// Token-gated feed for the OBS Wheel of Fortune overlay. Returns the segments to
// draw plus the latest spin so the overlay can animate the wheel landing on it.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";
import { getWheelConfig } from "@/lib/wheel";
import { displayNick } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [cfg, latest] = await Promise.all([
    getWheelConfig(),
    prisma.wheelSpin.findFirst({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, displayName: true, image: true } } },
    }),
  ]);

  // Map the recorded label back to a segment index so the overlay knows where to land.
  const segmentIndex = latest ? cfg.segments.findIndex((s) => s.label === latest.segmentLabel) : -1;

  return NextResponse.json({
    enabled: cfg.enabled,
    segments: cfg.segments.map((s) => ({ label: s.label, color: s.color, rewardTokens: s.rewardTokens })),
    latest: latest
      ? {
          id: latest.id,
          segmentIndex,
          segmentLabel: latest.segmentLabel,
          rewardTokens: latest.rewardTokens,
          actorName: displayNick(latest.user.displayName, latest.user.username),
          actorImage: latest.user.image ?? null,
          at: latest.createdAt.toISOString(),
        }
      : null,
  });
}
