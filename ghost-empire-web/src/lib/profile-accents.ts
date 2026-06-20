// src/lib/profile-accents.ts
// Profile accent presets (#546) — a viewer can tint their own public profile (avatar
// ring + name glow) with one of these. Pure source of truth for the picker, the API
// validator, and the render. `null`/unknown → the portal's brand accent (no override).
export const PROFILE_ACCENTS = [
  { key: "crimson", color: "#e50914" },
  { key: "rose", color: "#fb7185" },
  { key: "orange", color: "#f97316" },
  { key: "amber", color: "#f59e0b" },
  { key: "lime", color: "#84cc16" },
  { key: "emerald", color: "#10b981" },
  { key: "cyan", color: "#06b6d4" },
  { key: "sky", color: "#0ea5e9" },
  { key: "violet", color: "#8b5cf6" },
  { key: "fuchsia", color: "#d946ef" },
] as const;

export type ProfileAccentKey = (typeof PROFILE_ACCENTS)[number]["key"];

const BY_KEY = new Map(PROFILE_ACCENTS.map((a) => [a.key, a.color]));

/** True when `key` is a known accent preset. */
export function isAccentKey(key: string): boolean {
  return BY_KEY.has(key as ProfileAccentKey);
}

/** Preset key → hex color, or null for unknown/empty (caller falls back to the brand). */
export function accentColor(key: string | null | undefined): string | null {
  return key ? BY_KEY.get(key as ProfileAccentKey) ?? null : null;
}
