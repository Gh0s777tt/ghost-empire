// src/lib/govee.ts
// Dormant lighting: flash a Govee smart light on celebratory stream events (donation / sub /
// cheer) via the Govee cloud Developer API. Govee is a CLOUD API, so the portal actuates
// server-side — no local bridge like OBS. DORMANT until GOVEE_API_KEY + GOVEE_DEVICE_ID +
// GOVEE_DEVICE_MODEL are set → no-op otherwise (dry-wired like Stripe/AI). Best-effort and
// never throws — it's called fire-and-forget from dispatchAlert, so a lighting hiccup can
// never break an alert/economy path.
//
// v1 is env-configured (one device, founder-scoped). Per-tenant config + per-event rules +
// an admin UI is a clean follow-up (mirrors the OBS-control feature). See docs/LIGHTING.md.
import { createLogger } from "@/lib/logger";

const log = createLogger("govee");
const API = "https://developer-api.govee.com/v1/devices/control";
const FLASH_DEFAULTS = "donation,twitch_sub,twitch_gift_sub,twitch_cheer";

export function goveeConfigured(): boolean {
  return Boolean(process.env.GOVEE_API_KEY && process.env.GOVEE_DEVICE_ID && process.env.GOVEE_DEVICE_MODEL);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

async function setColor(rgb: { r: number; g: number; b: number }): Promise<boolean> {
  try {
    const res = await fetch(API, {
      method: "PUT",
      headers: { "Govee-API-Key": process.env.GOVEE_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        device: process.env.GOVEE_DEVICE_ID,
        model: process.env.GOVEE_DEVICE_MODEL,
        cmd: { name: "color", value: rgb },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) log.warn("govee control non-ok", { status: res.status });
    return res.ok;
  } catch (e) {
    log.warn("govee setColor failed", { error: (e as Error).message });
    return false;
  }
}

/**
 * Flash the configured light for an alert (best-effort). No-op unless configured + the alert
 * type is enabled (GOVEE_FLASH_TYPES) + the amount clears the optional GOVEE_MIN_AMOUNT. Sets
 * GOVEE_FLASH_COLOR, then (if GOVEE_REST_COLOR is set) reverts after GOVEE_FLASH_MS. `tenantId`
 * is accepted for the future per-tenant version; the env-based v1 is global.
 */
export async function flashGoveeOnAlert(alert: { type: string; amount: number | null }, _tenantId: string | null): Promise<void> {
  if (!goveeConfigured()) return;

  const types = (process.env.GOVEE_FLASH_TYPES || FLASH_DEFAULTS).split(",").map((t) => t.trim()).filter(Boolean);
  if (!types.includes(alert.type)) return;

  const min = Number(process.env.GOVEE_MIN_AMOUNT || 0);
  if (min > 0 && (alert.amount ?? 0) < min) return;

  const flash = hexToRgb(process.env.GOVEE_FLASH_COLOR || "#E50914");
  if (!flash) return;
  await setColor(flash);

  // Optional revert to a resting color after the flash window (best-effort; serverless may
  // freeze the function after the response, so a short window is most reliable).
  const flashMs = Number(process.env.GOVEE_FLASH_MS || 4000);
  const rest = process.env.GOVEE_REST_COLOR ? hexToRgb(process.env.GOVEE_REST_COLOR) : null;
  if (flashMs > 0 && rest) {
    await new Promise((r) => setTimeout(r, Math.min(Math.max(flashMs, 200), 30_000)));
    await setColor(rest);
  }
}
