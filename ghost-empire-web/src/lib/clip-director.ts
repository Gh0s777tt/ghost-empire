// src/lib/clip-director.ts
// AI Clip Director (#517): on each chat message, check for a hype spike and — when
// enabled and off cooldown — auto-create a Twitch clip and record it. Everything is
// best-effort and fire-and-forget from the chat ingest, so it can never slow or break
// chat. Dormant until the streamer enables it AND has the `clips:edit` scope.
import { prisma } from "@/lib/prisma";
import { createTwitchClip } from "@/lib/twitch-clips";
import { recordAndCheckHype } from "@/lib/hype-detector";
import { createLogger } from "@/lib/logger";

const log = createLogger("clip-director");

export type ClipDirectorCfg = { enabled: boolean; threshold: number; windowSec: number; cooldownSec: number };
const DEFAULT_CFG: ClipDirectorCfg = { enabled: false, threshold: 10, windowSec: 8, cooldownSec: 120 };

// Config rarely changes — cache it briefly so the chat hot path doesn't hit the DB
// every message. Invalidated on admin save.
const cfgCache = new Map<string, { at: number; cfg: ClipDirectorCfg }>();
const CFG_TTL = 60_000;

export async function getClipDirectorConfig(tid: string | null): Promise<ClipDirectorCfg> {
  const key = tid ?? "default";
  const cached = cfgCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < CFG_TTL) return cached.cfg;
  let cfg = DEFAULT_CFG;
  try {
    const row = tid
      ? await prisma.clipDirectorConfig.findUnique({ where: { tenantId: tid } })
      : await prisma.clipDirectorConfig.findFirst();
    if (row) cfg = { enabled: row.enabled, threshold: row.threshold, windowSec: row.windowSec, cooldownSec: row.cooldownSec };
  } catch {
    /* table not migrated yet → defaults (disabled) */
  }
  cfgCache.set(key, { at: now, cfg });
  return cfg;
}

export function invalidateClipDirectorConfig(): void {
  cfgCache.clear();
}

/** Best-effort hype check for one chat message — call fire-and-forget from the ingest. */
export async function handleChatHype(tid: string | null): Promise<void> {
  const cfg = await getClipDirectorConfig(tid);
  if (!cfg.enabled) return;
  const spike = recordAndCheckHype(tid ?? "default", Date.now(), {
    windowMs: cfg.windowSec * 1000,
    threshold: cfg.threshold,
    cooldownMs: cfg.cooldownSec * 1000,
  });
  if (spike) await createAutoClip(tid, "hype");
}

/** Create a Twitch clip and record it. Returns the stored row, or null if not possible. */
export async function createAutoClip(tid: string | null, reason: "hype" | "manual") {
  const clip = await createTwitchClip(tid);
  if (!clip) return null;
  try {
    const row = await prisma.autoClip.create({
      data: { ...(tid ? { tenantId: tid } : {}), clipId: clip.id, editUrl: clip.editUrl, reason },
    });
    log.info("auto-clip created", { reason, clipId: clip.id });
    return row;
  } catch (e) {
    log.error("store auto-clip failed", e);
    return null;
  }
}
