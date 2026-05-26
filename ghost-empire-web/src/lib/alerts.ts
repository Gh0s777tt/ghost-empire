// src/lib/alerts.ts
// Stream alerts — dispatch helpers used by endpoints to push OBS overlay events.
// Storage is a DB queue; the overlay polls /api/alerts/queue.
import { prisma } from "@/lib/prisma";

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

/** Settings singleton — lazy-created on first read. */
export async function getSettings() {
  return prisma.streamAlertSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

/** Validates the overlay token from query/header against env. Used by /overlay + /api/alerts/queue. */
export function isValidOverlayToken(token: string | null | undefined): boolean {
  const expected = process.env.OVERLAY_TOKEN;
  if (!expected || expected === "REPLACE_WITH_HEX_32_BYTES") return false;
  if (!token || typeof token !== "string") return false;
  if (token.length !== expected.length) return false;
  // Constant-time compare
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
