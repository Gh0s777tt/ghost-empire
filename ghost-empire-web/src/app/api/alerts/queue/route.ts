// src/app/api/alerts/queue/route.ts
// Polled by the OBS overlay every ~1s. Returns alerts newer than `since`.
// Token-gated (constant-time compare against OVERLAY_TOKEN env).
//
// On first hand-off to the overlay, sets `shownAt` so we know which alerts
// have been delivered at least once. Re-queries with `since=<last>` give
// only newer rows — `shownAt` here is purely for admin debugging.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings, isValidOverlayToken, getAlertTypeConfigs } from "@/lib/alerts";
import { DEFAULT_ALERT_TYPE_CFG } from "@/lib/alert-types";

export const dynamic = "force-dynamic";

const MAX_TAKE = 20;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceParam = url.searchParams.get("since");
  let since: Date;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid since" }, { status: 400 });
    }
    since = parsed;
  } else {
    // First connect — only show alerts from the last 10 seconds, not all history
    since = new Date(Date.now() - 10_000);
  }

  const [alerts, settings, typeConfigs] = await Promise.all([
    prisma.streamAlert.findMany({
      where: { createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      take: MAX_TAKE,
    }),
    getSettings(),
    getAlertTypeConfigs(),
  ]);

  // Mark un-shown alerts as shown (best-effort, single bulk update)
  const unshownIds = alerts.filter((a) => !a.shownAt).map((a) => a.id);
  if (unshownIds.length > 0) {
    await prisma.streamAlert
      .updateMany({
        where: { id: { in: unshownIds }, shownAt: null },
        data: { shownAt: new Date() },
      })
      .catch(() => {});
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    settings: {
      durationMs: settings.durationMs,
      accentColor: settings.accentColor,
      soundEnabled: settings.soundEnabled,
      enabledTypes: settings.enabledTypes,
      sizeScale: settings.sizeScale,
      textScale: settings.textScale,
      textColor: settings.textColor,
    },
    alerts: alerts.flatMap((a) => {
      const cfg = typeConfigs[a.type] ?? DEFAULT_ALERT_TYPE_CFG;
      // Amount threshold — hide alerts below the type's minAmount (e.g. small donations).
      if (cfg.minAmount != null && (a.amount ?? 0) < cfg.minAmount) return [];
      // Per-alert accent override (custom alerts store it in meta JSON).
      let accent: string | null = null;
      if (a.meta) {
        try { accent = (JSON.parse(a.meta) as { accent?: string }).accent ?? null; } catch { /* ignore */ }
      }
      return [{
        id: a.id,
        type: a.type,
        title: a.title,
        message: a.message,
        icon: a.icon,
        actorName: a.actorName,
        actorImage: a.actorImage,
        amount: a.amount,
        amountLabel: a.amountLabel,
        accent,
        animation: cfg.animation,
        position: cfg.position,
        soundUrl: cfg.soundUrl,
        createdAt: a.createdAt.toISOString(),
      }];
    }),
  });
}
