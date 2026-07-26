// src/lib/hue-rules.ts
// Per-tenant Philips Hue lighting — pure logic mapping a StreamAlert event to Hue light actions.
// TESTABLE CORE: no DB, no network, no fetch. Deliberately mirrors lib/govee-rules.ts so the two
// lighting integrations stay one shape rather than drifting into two dialects, and reuses the alert
// trigger vocabulary + revert bounds from obs-rules (they react to the same alerts).
//
// ⚠️ WHY HUE IS ACTUATED DIFFERENTLY FROM GOVEE — the fact that decides this whole integration.
// Govee is a CLOUD API, so lib/govee.ts dispatches server-side from Vercel. The Hue Bridge is a
// physical box on the STREAMER'S LAN (the column is literally `hueBridgeIp`, e.g. 192.168.1.50), and
// no serverless function can reach a private address. So Hue is actuated from the in-OBS browser
// source — the one thing the portal already runs on the streamer's own machine. That is also why
// this file stops at the pure mapping: the transport lives with the actuator, not here.
//
// The actuator translates each action into the Bridge's local API:
//   • set_color      -> light state with CIE xy converted from the hex (Hue takes xy/hue-sat, not RGB)
//   • set_brightness -> light state `bri` 1..254 (NOT 0..100 — see BRI_MIN/BRI_MAX below)
//   • turn           -> light state `on: true | false`
// `revertAfterMs` is honoured by the shared revert ledger in lib/obs-revert.ts, so a Hue flash
// inherits the "first effect owns the baseline, last owns the deadline" rule for free instead of
// growing a second set of timers.
import { ALERT_TRIGGER_TYPES, ANY_TRIGGER, REVERT_MIN_MS, REVERT_MAX_MS, type AlertLike } from "@/lib/obs-rules";
import { normalizeHex } from "@/lib/govee-rules";

export { ALERT_TRIGGER_TYPES, ANY_TRIGGER, REVERT_MIN_MS, REVERT_MAX_MS, normalizeHex };
export type { AlertLike };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The Hue action kinds the actuator knows how to send. Same three as Govee, on purpose. */
export const HUE_ACTION_KINDS = ["set_color", "set_brightness", "turn"] as const;
export type HueActionKind = (typeof HUE_ACTION_KINDS)[number];

/**
 * Hue brightness is 1..254, not 0..100.
 *
 * @remarks
 * This is the single most likely place to introduce a silent bug by copying the Govee code: Govee
 * takes a percentage. Sending 100 to a Bridge asks for ~39% brightness, and sending 0 is not "off"
 * but an error on many lights. So the streamer still configures a PERCENTAGE (one mental model across
 * both integrations) and {@link briFromPercent} converts at the edge.
 */
export const BRI_MIN = 1;
export const BRI_MAX = 254;

/** Percentage range the streamer configures, identical to Govee so the panel reads the same. */
export const BRIGHTNESS_MIN = 0;
export const BRIGHTNESS_MAX = 100;

/**
 * Convert a 0–100 percentage to the Bridge's 1–254 `bri` value.
 *
 * @param percent - What the streamer configured.
 * @returns A value inside [{@link BRI_MIN}, {@link BRI_MAX}].
 *
 * @remarks
 * 0% maps to `BRI_MIN`, not to 0: `bri: 0` is out of range for the Bridge. Turning a light OFF is a
 * separate action (`turn`), which is the honest way to express it.
 */
export function briFromPercent(percent: number): number {
  const p = Math.min(Math.max(Number.isFinite(percent) ? percent : 0, BRIGHTNESS_MIN), BRIGHTNESS_MAX);
  return Math.max(BRI_MIN, Math.round((p / 100) * BRI_MAX));
}

/**
 * Convert `#rrggbb` to CIE xy, which is what the Bridge accepts for colour.
 *
 * @param hex - A colour already normalised by {@link normalizeHex}.
 * @returns `[x, y]` rounded to 4 decimals, or null when the hex is unusable.
 *
 * @remarks
 * sRGB → linear → CIE XYZ (Wide Gamut RGB D65, the matrix Philips publishes for Hue) → xy. Pure and
 * tested because a wrong matrix does not fail loudly: it silently lights the wrong colour, which is
 * the kind of bug nobody files and everybody notices on stream.
 */
export function hexToXy(hex: string): [number, number] | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const to01 = (i: number) => parseInt(norm.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  // sRGB gamma expansion.
  const lin = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const [r, g, b] = [lin(to01(0)), lin(to01(1)), lin(to01(2))];

  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

  const sum = X + Y + Z;
  // Pure black has no chromaticity. Returning null makes the caller pick `turn: off` instead of
  // sending a meaningless xy — a light cannot be "black", it can only be off.
  if (sum <= 0) return null;
  return [Math.round((X / sum) * 10000) / 10000, Math.round((Y / sum) * 10000) / 10000];
}

export type HueAction =
  | { kind: "set_color"; hex: string; revertHex?: string | null; revertAfterMs?: number | null }
  | { kind: "set_brightness"; percent: number; revertAfterMs?: number | null }
  | { kind: "turn"; on: boolean; revertAfterMs?: number | null };

/** A streamer-defined rule: when an alert of `triggerType` (and ≥ `minAmount`) fires, run `action`. */
export type HueRule = {
  id?: string;
  enabled: boolean;
  /** A StreamAlert.type, or ANY_TRIGGER ("*") for every alert. */
  triggerType: string;
  /** Only fire when (alert.amount ?? 0) >= minAmount. null/undefined = no threshold. */
  minAmount?: number | null;
  /** Which Bridge light to drive. Empty = every light the Bridge exposes. */
  lightId?: string | null;
  action: HueAction;
  /** Lower runs first when several rules match one alert. */
  sortOrder?: number;
};

/** The actions to run for one alert, in `sortOrder` then declaration order. */
export function hueActionsForAlert(alert: AlertLike, rules: readonly HueRule[]): HueAction[] {
  const amount = alert.amount ?? 0;
  return rules
    .filter((r) => r.enabled)
    .filter((r) => r.triggerType === ANY_TRIGGER || r.triggerType === alert.type)
    .filter((r) => r.minAmount == null || amount >= r.minAmount)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((r) => r.action);
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const validRevert = (v: unknown): boolean =>
  v == null || (typeof v === "number" && Number.isInteger(v) && v >= REVERT_MIN_MS && v <= REVERT_MAX_MS);

/** Validate + normalise an untrusted action descriptor (admin form / API body). */
export function validateHueAction(input: unknown): Result<HueAction> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "action must be an object" };
  const a = input as Record<string, unknown>;
  if (typeof a.kind !== "string" || !(HUE_ACTION_KINDS as readonly string[]).includes(a.kind)) {
    return { ok: false, error: `action.kind must be one of ${HUE_ACTION_KINDS.join(", ")}` };
  }
  if (!validRevert(a.revertAfterMs)) {
    return { ok: false, error: `revertAfterMs must be an integer in [${REVERT_MIN_MS}, ${REVERT_MAX_MS}] or null` };
  }
  const revertAfterMs = (a.revertAfterMs ?? null) as number | null;

  if (a.kind === "set_color") {
    const hex = normalizeHex(a.hex);
    if (!hex) return { ok: false, error: "set_color requires a #rrggbb hex" };
    if (!hexToXy(hex)) return { ok: false, error: "set_color cannot use pure black — use turn: off instead" };
    const revertHex = a.revertHex == null || a.revertHex === "" ? null : normalizeHex(a.revertHex);
    if (a.revertHex != null && a.revertHex !== "" && !revertHex) {
      return { ok: false, error: "revertHex must be a #rrggbb hex or empty" };
    }
    return { ok: true, value: { kind: "set_color", hex, revertHex, revertAfterMs } };
  }
  if (a.kind === "set_brightness") {
    const n = Math.round(Number(a.percent));
    if (!Number.isFinite(n) || n < BRIGHTNESS_MIN || n > BRIGHTNESS_MAX) {
      return { ok: false, error: `set_brightness requires percent in [${BRIGHTNESS_MIN}, ${BRIGHTNESS_MAX}]` };
    }
    return { ok: true, value: { kind: "set_brightness", percent: n, revertAfterMs } };
  }
  if (typeof a.on !== "boolean") return { ok: false, error: "turn requires a boolean on" };
  return { ok: true, value: { kind: "turn", on: a.on, revertAfterMs } };
}

/** Validate + normalise an untrusted rule (admin form / API body). */
export function validateHueRule(input: unknown): Result<HueRule> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "rule must be an object" };
  const r = input as Record<string, unknown>;

  if (!nonEmpty(r.triggerType)) return { ok: false, error: "triggerType is required" };
  const triggerType = r.triggerType.trim();
  if (triggerType !== ANY_TRIGGER && !(ALERT_TRIGGER_TYPES as readonly string[]).includes(triggerType)) {
    return { ok: false, error: `triggerType must be ${ANY_TRIGGER} or one of ${ALERT_TRIGGER_TYPES.join(", ")}` };
  }

  let minAmount: number | null = null;
  if (r.minAmount != null && r.minAmount !== "") {
    const n = Math.round(Number(r.minAmount));
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "minAmount must be a non-negative integer or null" };
    minAmount = n;
  }

  const action = validateHueAction(r.action);
  if (!action.ok) return action;

  const sortOrder = Number.isFinite(Number(r.sortOrder)) ? Math.round(Number(r.sortOrder)) : 0;
  return {
    ok: true,
    value: {
      ...(nonEmpty(r.id) ? { id: r.id.trim() } : {}),
      enabled: r.enabled !== false,
      triggerType,
      minAmount,
      lightId: nonEmpty(r.lightId) ? r.lightId.trim().slice(0, 64) : null,
      action: action.value,
      sortOrder,
    },
  };
}
