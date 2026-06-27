// src/lib/govee.ts
// Per-tenant Govee lighting actuator (#720/#721/#722). A StreamAlert event drives a portal's
// Govee smart light via the Govee cloud Developer API — server-side (no local bridge like OBS).
// Best-effort and NEVER throws: it's called fire-and-forget from dispatchAlert, so a lighting
// hiccup can never break an alert/economy path. Dormant until a portal has Govee creds (in
// IntegrationConfig) + rules (govee_rules) — or the founder's env vars (the v1 fallback).
//
// Per portal: resolve creds (per-tenant IntegrationConfig first, else env), load the tenant's
// enabled GoveeRules, and run goveeActionsForAlert() (pure, tested in lib/govee-rules.ts). When
// a portal has creds but no rules AND the creds came from env, fall back to the legacy v1
// env-flash so the founder's existing setup keeps working unchanged.
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { goveeActionsForAlert, goveeActionFromRow, type GoveeAction, type GoveeRule, type AlertLike } from "@/lib/govee-rules";

const log = createLogger("govee");
const API = "https://developer-api.govee.com/v1/devices/control";

type GoveeCreds = { apiKey: string; deviceId: string; model: string; fromEnv: boolean };

export function goveeConfigured(): boolean {
  return Boolean(process.env.GOVEE_API_KEY && process.env.GOVEE_DEVICE_ID && process.env.GOVEE_DEVICE_MODEL);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clampMs = (ms: number) => Math.min(Math.max(ms, 200), 30_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve a portal's Govee creds: per-tenant IntegrationConfig first, else env (founder v1). */
async function resolveGoveeCreds(tenantId: string | null): Promise<GoveeCreds | null> {
  try {
    const cfg = tenantId
      ? await prisma.integrationConfig.findFirst({ where: { tenantId }, select: { goveeApiKey: true, goveeDeviceId: true, goveeDeviceModel: true } })
      : await prisma.integrationConfig.findUnique({ where: { id: "default" }, select: { goveeApiKey: true, goveeDeviceId: true, goveeDeviceModel: true } });
    const apiKey = decryptSecret(cfg?.goveeApiKey);
    if (apiKey && cfg?.goveeDeviceId && cfg?.goveeDeviceModel) {
      return { apiKey, deviceId: cfg.goveeDeviceId, model: cfg.goveeDeviceModel, fromEnv: false };
    }
  } catch {
    /* DB hiccup — fall through to env */
  }
  if (goveeConfigured()) {
    return { apiKey: process.env.GOVEE_API_KEY!, deviceId: process.env.GOVEE_DEVICE_ID!, model: process.env.GOVEE_DEVICE_MODEL!, fromEnv: true };
  }
  return null;
}

async function goveeCmd(creds: GoveeCreds, cmd: { name: string; value: unknown }): Promise<boolean> {
  try {
    const res = await fetch(API, {
      method: "PUT",
      headers: { "Govee-API-Key": creds.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ device: creds.deviceId, model: creds.model, cmd }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) log.warn("govee control non-ok", { status: res.status });
    return res.ok;
  } catch (e) {
    log.warn("govee cmd failed", { error: (e as Error).message });
    return false;
  }
}

/** Apply one resolved GoveeAction to the light (+ optional auto-revert window). */
async function applyGoveeAction(a: GoveeAction, creds: GoveeCreds): Promise<void> {
  if (a.kind === "set_color") {
    const rgb = hexToRgb(a.color);
    if (!rgb) return;
    await goveeCmd(creds, { name: "color", value: rgb });
    if (a.revertAfterMs && a.revertColor) {
      const rev = hexToRgb(a.revertColor);
      if (!rev) return;
      await sleep(clampMs(a.revertAfterMs));
      await goveeCmd(creds, { name: "color", value: rev });
    }
  } else if (a.kind === "set_brightness") {
    await goveeCmd(creds, { name: "brightness", value: a.brightness });
  } else {
    // turn on/off; optional revert toggles it back after the window.
    await goveeCmd(creds, { name: "turn", value: a.on ? "on" : "off" });
    if (a.revertAfterMs != null) {
      await sleep(clampMs(a.revertAfterMs));
      await goveeCmd(creds, { name: "turn", value: a.on ? "off" : "on" });
    }
  }
}

/** Legacy v1 env-flash: flash GOVEE_FLASH_COLOR for enabled alert types, then revert. Only used
 *  for the founder (env creds, no per-tenant rules) so the original #678 behaviour is preserved. */
async function legacyEnvFlash(alert: AlertLike, creds: GoveeCreds): Promise<void> {
  const FLASH_DEFAULTS = "donation,twitch_sub,twitch_gift_sub,twitch_cheer";
  const types = (process.env.GOVEE_FLASH_TYPES || FLASH_DEFAULTS).split(",").map((t) => t.trim()).filter(Boolean);
  if (!types.includes(alert.type)) return;
  const min = Number(process.env.GOVEE_MIN_AMOUNT || 0);
  if (min > 0 && (alert.amount ?? 0) < min) return;
  const flash = hexToRgb(process.env.GOVEE_FLASH_COLOR || "#E50914");
  if (!flash) return;
  await goveeCmd(creds, { name: "color", value: flash });
  const flashMs = Number(process.env.GOVEE_FLASH_MS || 4000);
  const rest = process.env.GOVEE_REST_COLOR ? hexToRgb(process.env.GOVEE_REST_COLOR) : null;
  if (flashMs > 0 && rest) {
    await sleep(clampMs(flashMs));
    await goveeCmd(creds, { name: "color", value: rest });
  }
}

/**
 * Run a portal's Govee lighting for an alert (best-effort, never throws). Resolves the portal's
 * creds + rules and actuates each matched action; falls back to the legacy env-flash only when
 * the creds came from env (founder v1) and no per-tenant rules exist.
 */
export async function actuateGoveeForAlert(alert: AlertLike, tenantId: string | null): Promise<void> {
  try {
    const creds = await resolveGoveeCreds(tenantId);
    if (!creds) return;

    const rows = await prisma.goveeRule.findMany({
      where: { enabled: true, ...(tenantId ? { tenantId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const rules: GoveeRule[] = rows.flatMap((r) => {
      const action = goveeActionFromRow(r);
      return action ? [{ enabled: r.enabled, triggerType: r.triggerType, minAmount: r.minAmount, action, sortOrder: r.sortOrder }] : [];
    });

    const actions = goveeActionsForAlert(alert, rules);
    if (actions.length > 0) {
      for (const a of actions) await applyGoveeAction(a, creds);
      return;
    }
    // No per-tenant rules: keep the founder's original env-flash working; sub-tenants that
    // configured creds but no rules intentionally do nothing until they add a rule.
    if (creds.fromEnv) await legacyEnvFlash(alert, creds);
  } catch (e) {
    log.warn("govee actuate failed", { error: (e as Error).message });
  }
}
