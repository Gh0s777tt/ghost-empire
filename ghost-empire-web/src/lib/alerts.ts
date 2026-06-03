// src/lib/alerts.ts
// Stream alerts — dispatch helpers used by endpoints to push OBS overlay events.
// Storage is a DB queue; the overlay polls /api/alerts/queue.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AlertAnimation, AlertPosition, AlertTypeCfg } from "@/lib/alert-types";

export type AlertType =
  | "shop_purchase"
  | "event_win"
  | "drop_claim_bonus"
  | "twitch_sub"
  | "twitch_gift_sub"
  | "twitch_cheer"
  | "donation"
  | "welcome"
  | "level_up"
  | "test";

export type AlertInput = {
  type: AlertType;
  title: string;
  message: string;
  icon?: string;
  actorName?: string;
  actorImage?: string;
  amount?: number;
  amountLabel?: string;
  meta?: Record<string, unknown>;
};

/**
 * Dispatch a stream alert — enqueues it for the OBS overlay to pick up.
 *
 * Fire-and-forget by design: any error here MUST NOT break the calling
 * transaction (e.g. shop purchase). Wrap in try/catch at call site,
 * or use `dispatchAlertSafe()` which swallows errors.
 *
 * Respects per-type enable flag from StreamAlertSettings — disabled types
 * are silently dropped so callers don't need to know.
 */
export async function dispatchAlert(input: AlertInput): Promise<{ id: string } | null> {
  const settings = await getSettings();
  if (!settings.enabledTypes.includes(input.type)) return null;

  const created = await prisma.streamAlert.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      icon: input.icon,
      actorName: input.actorName,
      actorImage: input.actorImage,
      amount: input.amount,
      amountLabel: input.amountLabel,
      meta: input.meta ? JSON.stringify(input.meta).slice(0, 2000) : null,
    },
    select: { id: true },
  });
  return created;
}

/** Same as dispatchAlert but never throws — for use inside transactions. */
export async function dispatchAlertSafe(input: AlertInput): Promise<void> {
  try {
    await dispatchAlert(input);
  } catch (e) {
    console.error("[alerts] dispatch failed:", e, "input:", input.type);
  }
}

/** Settings singleton — lazy-created on first read; lazy-generates overlayToken too. */
export async function getSettings() {
  const existing = await prisma.streamAlertSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  // Auto-generate the overlay token on first read so the admin never has to
  // hand-write env vars. Stored in DB, rotatable via the admin UI.
  if (!existing.overlayToken) {
    return prisma.streamAlertSettings.update({
      where: { id: "default" },
      data: { overlayToken: randomBytes(32).toString("hex") },
    });
  }
  return existing;
}

/** Regenerate the overlay token — invalidates the previous OBS browser source URL. */
export async function regenerateOverlayToken() {
  return prisma.streamAlertSettings.upsert({
    where: { id: "default" },
    create: { id: "default", overlayToken: randomBytes(32).toString("hex") },
    update: { overlayToken: randomBytes(32).toString("hex") },
  });
}

/** Validates the overlay token from query/header. Reads DB first, falls back to env var (legacy). */
export async function isValidOverlayToken(token: string | null | undefined): Promise<boolean> {
  if (!token || typeof token !== "string") return false;

  const settings = await prisma.streamAlertSettings.findUnique({
    where: { id: "default" },
    select: { overlayToken: true },
  });
  const candidates: string[] = [];
  if (settings?.overlayToken) candidates.push(settings.overlayToken);
  const envToken = process.env.OVERLAY_TOKEN;
  if (envToken && envToken !== "REPLACE_WITH_HEX_32_BYTES") candidates.push(envToken);

  for (const expected of candidates) {
    if (token.length !== expected.length) continue;
    // Constant-time compare
    let mismatch = 0;
    for (let i = 0; i < token.length; i++) {
      mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch === 0) return true;
  }
  return false;
}

/**
 * Per-alert-type overlay overrides, keyed by type. Only types that have a DB
 * row appear — merge with DEFAULT_ALERT_TYPE_CFG (lib/alert-types) at the use
 * site so unconfigured types fall back to the default look.
 */
export async function getAlertTypeConfigs(): Promise<Record<string, AlertTypeCfg>> {
  const rows = await prisma.alertTypeConfig.findMany();
  const map: Record<string, AlertTypeCfg> = {};
  for (const r of rows) {
    map[r.type] = {
      animation: r.animation as AlertAnimation,
      position: r.position as AlertPosition,
      soundUrl: r.soundUrl,
      minAmount: r.minAmount,
    };
  }
  return map;
}
