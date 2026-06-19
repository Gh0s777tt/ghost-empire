// src/lib/themes.ts
// The portal's selectable themes (#521). Each is a `[data-theme="<id>"]` block in
// globals.css that re-tints surfaces only — never the per-tenant accent (--brand) —
// so a streamer's brand colour survives every theme. Source of truth for the layout
// (cookie → data-theme) and the picker. Adding a theme = one entry here + one CSS block.

export const THEMES = ["dark", "light", "midnight", "slate", "forest", "plum"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "dark";

/** Coerce an arbitrary cookie value to a known theme (defaults to dark). */
export function normalizeTheme(value: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : DEFAULT_THEME;
}
