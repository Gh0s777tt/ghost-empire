// src/lib/alerts.ts
// Stream alerts — dispatch helpers used by endpoints to push OBS overlay events.
// Storage is a DB queue; the overlay polls /api/alerts/queue.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { fireOutgoingWebhooks } from "@/lib/webhooks-out";
import { notifyDonation } from "@/lib/web-push";
import type { AlertAnimation, AlertPosition, AlertTypeCfg } from "@/lib/alert-types";
import { createLogger } from "@/lib/logger";

const log = createLogger("alerts");

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
export async function dispatchAlert(input: AlertInput, tenantId?: string | null): Promise<{ id: string } | null> {
  // Tenant of the alert: webhook/poller callers pass the tenant they mapped
  // from the event (#417); omitted → resolve from the request Host.
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  const settings = await getSettings(tid);
  if (!settings.enabledTypes.includes(input.type)) return null;

  const created = await prisma.streamAlert.create({
    data: {
      ...(tid ? { tenantId: tid } : {}),
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

  // Fan out to any external webhooks subscribed to this event (best-effort, per-tenant).
  fireOutgoingWebhooks(input.type, {
    title: input.title,
    message: input.message,
    actorName: input.actorName ?? null,
    amount: input.amount ?? null,
    amountLabel: input.amountLabel ?? null,
  }, tid);

  // A real-money tip → "new tip" web push to this portal's subscribers (#535).
  // Fire-and-forget like the webhooks above; dormant-safe + never throws. Already
  // gated by the per-type enable check above, so disabling donation alerts mutes it.
  if (input.type === "donation") {
    void notifyDonation(tid, { name: input.actorName, amount: input.amount, amountLabel: input.amountLabel }).catch(() => {});
  }

  return created;
}

/** Same as dispatchAlert but never throws — for use inside transactions. */
export async function dispatchAlertSafe(input: AlertInput, tenantId?: string | null): Promise<void> {
  try {
    await dispatchAlert(input, tenantId);
  } catch (e) {
    log.error("dispatch failed", e, { input: input.type });
  }
}

/**
 * Alert settings — one row per tenant (Phase 4 overlay pass), lazy-created on
 * first read; lazy-generates overlayToken too. `tenantId`: undefined → resolve
 * from the request Host, string → that tenant, null → legacy "default" row.
 */
export async function getSettings(tenantId?: string | null) {
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  // Read-FIRST: this runs every SSE tick (~1s per OBS source). The old
  // unconditional upsert was a WRITE every tick — now we only write when the
  // row is missing (first read) or the token still needs generating.
  let existing = tid
    ? await prisma.streamAlertSettings.findUnique({ where: { tenantId: tid } })
    : await prisma.streamAlertSettings.findUnique({ where: { id: "default" } });
  if (!existing) {
    existing = tid
      ? await prisma.streamAlertSettings.upsert({ where: { tenantId: tid }, create: { tenantId: tid }, update: {} })
      : await prisma.streamAlertSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  }

  // Auto-generate the overlay token on first read so the admin never has to
  // hand-write env vars. Stored in DB, rotatable via the admin UI.
  if (!existing.overlayToken) {
    return prisma.streamAlertSettings.update({
      where: { id: existing.id },
      data: { overlayToken: randomBytes(32).toString("hex") },
    });
  }
  return existing;
}

/** Regenerate the overlay token — invalidates the previous OBS browser source URL. */
export async function regenerateOverlayToken(tenantId?: string | null) {
  const settings = await getSettings(tenantId); // ensures the row exists
  return prisma.streamAlertSettings.update({
    where: { id: settings.id },
    data: { overlayToken: randomBytes(32).toString("hex") },
  });
}

/**
 * Validates the overlay token against the CURRENT tenant's settings (Host-resolved
 * by default). STRICT per-tenant (#audit-M1): a real tenant validates ONLY against
 * its own `overlayToken` — never the legacy "default" row, and never the global env
 * `OVERLAY_TOKEN` — so one portal's OBS URL can't drive another portal's overlay.
 * The default row + env fallback survive ONLY for the legacy/founder portal
 * (`tid === null`), which is the platform owner's own portal, not a cross-tenant
 * surface.
 */
export async function isValidOverlayToken(token: string | null | undefined, tenantId?: string | null): Promise<boolean> {
  if (!token || typeof token !== "string") return false;

  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  const rows = await prisma.streamAlertSettings.findMany({
    where: tid ? { tenantId: tid } : { id: "default" },
    select: { overlayToken: true },
  });
  const candidates: string[] = [];
  for (const r of rows) if (r.overlayToken) candidates.push(r.overlayToken);
  // Env fallback is for the legacy/founder portal only — a customer tenant must
  // never validate against a single global env token.
  if (!tid) {
    const envToken = process.env.OVERLAY_TOKEN;
    if (envToken && envToken !== "REPLACE_WITH_HEX_32_BYTES") candidates.push(envToken);
  }

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
export async function getAlertTypeConfigs(tenantId?: string | null): Promise<Record<string, AlertTypeCfg>> {
  // Per-tenant (#512): each portal styles its own alert types. undefined → resolve
  // from the request Host; an explicit value is threaded by the SSE feed (no request).
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  const rows = await prisma.alertTypeConfig.findMany({ where: tid ? { tenantId: tid } : {} });
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
