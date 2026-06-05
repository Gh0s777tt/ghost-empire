// src/lib/widget-fonts.ts
// Single source of truth for the fonts offered in the widget generator, custom
// widgets and the chat overlay. The display fonts load via one Google Fonts <link>
// (see GOOGLE_FONTS_HREF, added in app/layout.tsx) so the literal family names
// resolve everywhere — including OBS browser sources. Inter / JetBrains Mono come
// from next/font; "system" needs no load.

export type FontOption = { value: string; label: string; stack: string };

export const WIDGET_FONTS: FontOption[] = [
  { value: "Inter",            label: "Inter (domyślna)",     stack: "'Inter', system-ui, sans-serif" },
  { value: "JetBrains Mono",   label: "JetBrains Mono",       stack: "'JetBrains Mono', ui-monospace, monospace" },
  { value: "Anton",            label: "Anton (gruba)",        stack: "'Anton', Impact, sans-serif" },
  { value: "Bebas Neue",       label: "Bebas Neue (caps)",    stack: "'Bebas Neue', Impact, sans-serif" },
  { value: "Oswald",           label: "Oswald (wąska)",       stack: "'Oswald', sans-serif" },
  { value: "Russo One",        label: "Russo One (gaming)",   stack: "'Russo One', sans-serif" },
  { value: "Montserrat",       label: "Montserrat",           stack: "'Montserrat', sans-serif" },
  { value: "Rubik",            label: "Rubik (zaokrąglona)",  stack: "'Rubik', sans-serif" },
  { value: "Bangers",          label: "Bangers (komiks)",     stack: "'Bangers', cursive" },
  { value: "Permanent Marker", label: "Permanent Marker",     stack: "'Permanent Marker', cursive" },
  { value: "Pacifico",         label: "Pacifico (pismo)",     stack: "'Pacifico', cursive" },
  { value: "Press Start 2P",   label: "Press Start 2P (retro)", stack: "'Press Start 2P', monospace" },
  { value: "system",           label: "Systemowa",            stack: "system-ui, sans-serif" },
];

const STACKS: Record<string, string> = Object.fromEntries(WIDGET_FONTS.map((f) => [f.value, f.stack]));

/** CSS font-family stack for a stored font value (falls back to Inter). */
export function fontStack(value: string | null | undefined): string {
  return (value && STACKS[value]) || STACKS.Inter;
}

// One combined Google Fonts request for every display font above. Font files only
// download when a page actually renders glyphs in that family, so this is cheap on
// pages that don't use them.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Oswald:wght@400;600&family=Russo+One&family=Montserrat:wght@400;700&family=Rubik:wght@400;700&family=Bangers&family=Permanent+Marker&family=Pacifico&family=Press+Start+2P&display=swap";
