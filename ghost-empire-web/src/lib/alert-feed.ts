// src/lib/alert-feed.ts
// Shared alert-feed query + shaping used by BOTH transports:
//   • the polled  /api/alerts/queue  route, and
//   • the realtime /api/alerts/stream (SSE) route.
// Keeping the query + payload shaping in one place means the two transports can
// never drift — switching an overlay from polling to SSE is purely a delivery
// change, not a data change.
import { prisma } from "@/lib/prisma";
import { getSettings, getAlertTypeConfigs } from "@/lib/alerts";
import {
  DEFAULT_ALERT_TYPE_CFG,
  type AlertTypeCfg,
  type AlertAnimation,
  type AlertPosition,
} from "@/lib/alert-types";

const MAX_TAKE = 20;

export type FeedSettings = {
  durationMs: number;
  accentColor: string;
  soundEnabled: boolean;
  enabledTypes: string[];
  sizeScale: number;
  textScale: number;
  textColor: string;
};

export type FeedAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string | null;
  actorName: string | null;
  actorImage: string | null;
  amount: number | null;
  amountLabel: string | null;
  accent: string | null;
  animation: AlertAnimation;
  position: AlertPosition;
  soundUrl: string | null;
  createdAt: string;
};

export type AlertFeed = { now: string; settings: FeedSettings; alerts: FeedAlert[] };

// Minimal row shape read from StreamAlert — declared locally so shapeAlerts()
// stays pure (no Prisma import needed) and is unit-testable in isolation.
export type AlertRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string | null;
  actorName: string | null;
  actorImage: string | null;
  amount: number | null;
  amountLabel: string | null;
  meta: string | null;
  createdAt: Date;
  shownAt: Date | null;
};

/**
 * Pure transform: DB rows → overlay payloads. Applies the per-type `minAmount`
 * threshold (drops sub-threshold alerts, e.g. tiny donations) and lifts a
 * per-alert accent override out of the `meta` JSON. No I/O → unit-tested directly.
 */
export function shapeAlerts(
  rows: AlertRow[],
  typeConfigs: Record<string, AlertTypeCfg>,
): FeedAlert[] {
  return rows.flatMap((a) => {
    const cfg = typeConfigs[a.type] ?? DEFAULT_ALERT_TYPE_CFG;
    // Amount threshold — hide alerts below the type's minAmount.
    if (cfg.minAmount != null && (a.amount ?? 0) < cfg.minAmount) return [];
    // Per-alert overrides stashed in the meta JSON: accent (custom alerts) and
    // soundUrl (GT sound redemptions — a specific sound per alert, not per type).
    let accent: string | null = null;
    let soundOverride: string | null = null;
    if (a.meta) {
      try {
        const m = JSON.parse(a.meta) as { accent?: string; soundUrl?: string };
        accent = m.accent ?? null;
        soundOverride = m.soundUrl ?? null;
      } catch {
        /* malformed meta — no overrides */
      }
    }
    return [
      {
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
        soundUrl: soundOverride ?? cfg.soundUrl,
        createdAt: a.createdAt.toISOString(),
      },
    ];
  });
}

function shapeSettings(s: Awaited<ReturnType<typeof getSettings>>): FeedSettings {
  return {
    durationMs: s.durationMs,
    accentColor: s.accentColor,
    soundEnabled: s.soundEnabled,
    enabledTypes: s.enabledTypes,
    sizeScale: s.sizeScale,
    textScale: s.textScale,
    textColor: s.textColor,
  };
}

/**
 * Fetch alerts created after `since`, mark freshly-delivered ones as shown, and
 * return them alongside the current overlay settings. The single source of truth
 * for both the polled queue endpoint and the SSE stream loop. `tenantId` is
 * resolved ONCE by the route handler (request Host) and threaded through —
 * never resolved here, because the SSE tick runs outside the request scope.
 * Tenant rows + legacy NULL rows are both served (pre-backfill safety).
 */
export async function fetchAlertFeed(since: Date, tenantId: string | null): Promise<AlertFeed> {
  const [rows, settings, typeConfigs] = await Promise.all([
    prisma.streamAlert.findMany({
      where: { createdAt: { gt: since }, ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}) },
      orderBy: { createdAt: "asc" },
      take: MAX_TAKE,
    }),
    getSettings(tenantId, { cached: true }),
    getAlertTypeConfigs(tenantId, { cached: true }),
  ]);

  // Mark un-shown alerts as shown (best-effort, single bulk update).
  const unshownIds = rows.filter((a) => !a.shownAt).map((a) => a.id);
  if (unshownIds.length > 0) {
    await prisma.streamAlert
      .updateMany({
        where: { id: { in: unshownIds }, shownAt: null, ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}) },
        data: { shownAt: new Date() },
      })
      .catch(() => {});
  }

  return {
    now: new Date().toISOString(),
    settings: shapeSettings(settings),
    alerts: shapeAlerts(rows, typeConfigs),
  };
}
