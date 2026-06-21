// src/lib/bg-presets.ts
// Curated per-portal background "templates" (#audit3 UX). Instead of pasting an image URL,
// a streamer can pick a ready-made dark gradient. We persist the choice in the EXISTING
// `Tenant.bgImageUrl` column using a `preset:<id>` scheme (no schema change) — the read
// path resolves a known preset to its CSS and otherwise treats the value as an image URL.
// Presets are deliberately DARK so white text stays readable without an extra overlay.

export type BgPreset = { id: string; label: string; css: string };

const PREFIX = "preset:";

// Each `css` is a full CSS `background-image` value (gradients fill the body).
export const BG_PRESETS: BgPreset[] = [
  { id: "nebula", label: "Nebula", css: "radial-gradient(ellipse at top, #1b1340 0%, #0a0a0f 55%)" },
  { id: "ember", label: "Ember", css: "radial-gradient(ellipse at top, #3a0f0f 0%, #0a0a0a 55%)" },
  { id: "forest", label: "Forest", css: "radial-gradient(ellipse at top, #0c2618 0%, #07120c 55%)" },
  { id: "abyss", label: "Abyss", css: "linear-gradient(160deg, #04060f 0%, #0a1226 50%, #04060f 100%)" },
  { id: "plum", label: "Plum", css: "radial-gradient(ellipse at top, #2a0f2a 0%, #0a060a 55%)" },
  { id: "aurora", label: "Aurora", css: "linear-gradient(160deg, #07121a 0%, #0a2230 45%, #06121a 100%)" },
];

const BY_ID = new Map(BG_PRESETS.map((p) => [p.id, p]));

/** The stored value for a preset (what goes into Tenant.bgImageUrl). */
export function bgPresetValue(id: string): string {
  return PREFIX + id;
}

/** True when a stored value references a KNOWN preset (e.g. "preset:nebula"). */
export function isBgPreset(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX) && BY_ID.has(value.slice(PREFIX.length));
}

/** The preset id of a stored value, or null when it isn't a known preset. */
export function bgPresetId(value: string | null | undefined): string | null {
  if (!isBgPreset(value)) return null;
  return (value as string).slice(PREFIX.length);
}

/** Resolve a stored value to its CSS `background-image`, or null when it isn't a known preset. */
export function resolveBgPresetCss(value: string | null | undefined): string | null {
  const id = bgPresetId(value);
  return id ? (BY_ID.get(id)?.css ?? null) : null;
}
