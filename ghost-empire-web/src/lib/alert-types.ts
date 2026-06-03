// src/lib/alert-types.ts
// Client-safe constants/types/helpers for per-alert-type overlay config.
// NO prisma import here — used by the OBS overlay (client) and the admin UI.
// The server-side loader lives in lib/alerts.ts (getAlertTypeConfigs).
import type { CSSProperties } from "react";

export const ALERT_ANIMATIONS = ["slide", "fade", "scale", "none"] as const;
export type AlertAnimation = (typeof ALERT_ANIMATIONS)[number];

export const ALERT_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type AlertPosition = (typeof ALERT_POSITIONS)[number];

export type AlertTypeCfg = {
  animation: AlertAnimation;
  position: AlertPosition;
  soundUrl: string | null;
  minAmount: number | null;
};

// Defaults reproduce the original overlay behaviour exactly (slide in from the
// right, anchored bottom-right, synthesized ding, no amount threshold). A type
// with no DB row uses these → unconfigured types look identical to before.
export const DEFAULT_ALERT_TYPE_CFG: AlertTypeCfg = {
  animation: "slide",
  position: "bottom-right",
  soundUrl: null,
  minAmount: null,
};

// Every alert type the admin can configure (label = PL name shown in /admin).
export const ALERT_TYPE_LIST: { type: string; label: string }[] = [
  { type: "twitch_sub", label: "Twitch — subskrypcja" },
  { type: "twitch_gift_sub", label: "Twitch — gift sub" },
  { type: "twitch_cheer", label: "Twitch — bity (cheer)" },
  { type: "donation", label: "Donejt (Streamlabs/YT)" },
  { type: "shop_purchase", label: "Zakup w sklepie" },
  { type: "event_win", label: "Wygrana w evencie" },
  { type: "drop_claim_bonus", label: "Drop — bonus" },
  { type: "welcome", label: "Powitanie nowego ducha" },
  { type: "level_up", label: "Level up" },
  { type: "custom", label: "Własny alert (custom)" },
  { type: "test", label: "Test" },
];

export const ANIMATION_LABELS: Record<AlertAnimation, string> = {
  slide: "Wjazd z boku (slide)",
  fade: "Płynne pojawienie (fade)",
  scale: "Powiększenie (scale)",
  none: "Bez animacji",
};

export const POSITION_LABELS: Record<AlertPosition, string> = {
  "top-left": "Góra-lewo",
  "top-center": "Góra-środek",
  "top-right": "Góra-prawo",
  center: "Środek ekranu",
  "bottom-left": "Dół-lewo",
  "bottom-center": "Dół-środek",
  "bottom-right": "Dół-prawo (domyślnie)",
};

const PAD = 32;
const SLIDE_TRANSITION =
  "transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease";

/** transform-origin for the AlertCard size scaling, matched to the anchor corner. */
export function scaleOriginFor(position: AlertPosition): string {
  if (position === "center") return "center";
  return position.replace("-", " ");
}

/**
 * Returns the styles for the overlay alert anchor given its position + animation
 * and current visibility. Two layers: `outer` places the card, `inner` animates
 * it — so the centering translate never fights the slide/scale transform.
 */
export function resolveAlertAnchorStyle(
  position: AlertPosition,
  animation: AlertAnimation,
  visible: boolean,
): { outer: CSSProperties; inner: CSSProperties } {
  const xCenter = position === "center" || position === "top-center" || position === "bottom-center";
  const isCenterBoth = position === "center";

  // --- OUTER: placement ---
  const outer: CSSProperties = { position: "absolute", width: 460, maxWidth: "calc(100vw - 32px)" };
  if (isCenterBoth) outer.top = "50%";
  else if (position.startsWith("top")) outer.top = PAD;
  else outer.bottom = PAD;

  if (xCenter) outer.left = "50%";
  else if (position.endsWith("left")) outer.left = PAD;
  else outer.right = PAD;

  if (isCenterBoth) outer.transform = "translate(-50%, -50%)";
  else if (xCenter) outer.transform = "translateX(-50%)";

  // --- INNER: animation ---
  let hidden: string;
  if (animation === "scale") hidden = "scale(0.85)";
  else if (animation === "fade" || animation === "none") hidden = "translate(0, 0)";
  else if (position.endsWith("right")) hidden = "translateX(120%)";
  else if (position.endsWith("left")) hidden = "translateX(-120%)";
  else if (position.startsWith("top")) hidden = "translateY(-120%)";
  else hidden = "translateY(120%)"; // bottom-center / center → slide up

  const shown = animation === "scale" ? "scale(1)" : "translate(0, 0)";

  const inner: CSSProperties = {
    transform: visible ? shown : hidden,
    opacity: visible ? 1 : 0,
    transition: animation === "none" ? "none" : SLIDE_TRANSITION,
    willChange: "transform, opacity",
  };

  return { outer, inner };
}
