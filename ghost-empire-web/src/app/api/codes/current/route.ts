// src/app/api/codes/current/route.ts
// Token-gated feed for the OBS code overlay (/overlay/codes). Returns the code
// currently on screen and lazily rotates to a new code once the configured
// interval has elapsed (or the current one was deactivated/deleted) — no cron
// needed, rotation advances on poll. Picks randomly from the least-shown tier so
// every code airs before any repeats.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";
import { getCodeConfig } from "@/lib/codes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getCodeConfig();
  if (!config.enabled) {
    return NextResponse.json({ enabled: false, serverNow: new Date().toISOString() });
  }

  const now = Date.now();
  const shownAtMs = config.currentShownAt?.getTime() ?? 0;

  // Resolve the pinned code — only if it still exists AND is active.
  let code = config.currentCodeId
    ? await prisma.streamCode.findFirst({
        where: { id: config.currentCodeId, active: true },
        select: { id: true, code: true, label: true },
      })
    : null;

  const intervalElapsed = now - shownAtMs >= config.intervalSeconds * 1000;

  // Advance if it's time, or if the pinned code vanished (deleted/deactivated).
  if (!code || intervalElapsed) {
    const agg = await prisma.streamCode.aggregate({
      where: { active: true },
      _min: { shownCount: true },
    });
    const minShown = agg._min.shownCount;
    if (minShown !== null && minShown !== undefined) {
      let pool = await prisma.streamCode.findMany({
        where: { active: true, shownCount: minShown },
        select: { id: true, code: true, label: true },
      });
      // Avoid an immediate repeat when there are other candidates.
      if (pool.length > 1 && config.currentCodeId) {
        pool = pool.filter((c) => c.id !== config.currentCodeId);
      }
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        await prisma.$transaction([
          prisma.codeDropConfig.update({
            where: { id: config.id },
            data: { currentCodeId: pick.id, currentShownAt: new Date() },
          }),
          prisma.streamCode.update({
            where: { id: pick.id },
            data: { shownCount: { increment: 1 }, lastShownAt: new Date() },
          }),
        ]);
        code = { id: pick.id, code: pick.code, label: pick.label };
      } else {
        code = null;
      }
    } else {
      code = null; // no active codes in the pool
    }
  }

  const activeCount = await prisma.streamCode.count({ where: { active: true } });

  return NextResponse.json({
    enabled: true,
    title: config.title,
    accentColor: config.accentColor,
    intervalSeconds: config.intervalSeconds,
    activeCount,
    code,
    serverNow: new Date().toISOString(),
  });
}
