// src/lib/brand-palette.ts
// Paleta portalu (update 2026-08): kontrast WCAG + kuratorowana lista krojów.
//
// Po co istnieje: `Tenant.brandColor` był JEDNYM kolorem, a reszta wyglądu pochodziła ze stałych
// motywów. Streamer z żółtym albo jasnozielonym brandem dostawał nieczytelny tekst i nie miał jak
// się o tym dowiedzieć — panel pokazywał próbkę koloru, nie czytelność. Ten moduł liczy kontrast
// dokładnie tak, jak robi to WCAG 2.1, żeby panel mógł powiedzieć wprost „ten tekst będzie
// nieczytelny", zanim portal zobaczą widzowie.
//
// Czysta logika, zero zależności — cała jest unit-testowana (konwencja repo: `src/lib/*` bez mocków).

/** Kolor w zapisie `#rgb` lub `#rrggbb` → składowe 0–255. `null`, gdy zapis jest nieprawidłowy. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace(/^#/, "");
  const pelny = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(pelny)) return null;
  return {
    r: parseInt(pelny.slice(0, 2), 16),
    g: parseInt(pelny.slice(2, 4), 16),
    b: parseInt(pelny.slice(4, 6), 16),
  };
}

/** Luminancja względna wg WCAG 2.1 (§ relative luminance). Wejście 0–255 na kanał. */
function luminancja({ r, g, b }: { r: number; g: number; b: number }): number {
  // Kanały najpierw do zakresu 0–1, potem korekta gamma (sRGB → liniowe).
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  // Wagi z WCAG — oko jest najczulsze na zieleń, najmniej na błękit.
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Współczynnik kontrastu dwóch kolorów wg WCAG 2.1 — wynik w zakresie 1 (brak kontrastu)
 * do 21 (czarny na białym). Kolejność argumentów nie ma znaczenia.
 * Zwraca `null`, gdy którykolwiek kolor ma nieprawidłowy zapis.
 */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = luminancja(ca);
  const lb = luminancja(cb);
  const [jasny, ciemny] = la >= lb ? [la, lb] : [lb, la];
  return (jasny + 0.05) / (ciemny + 0.05);
}

export type PoziomWcag = "AAA" | "AA" | "AA-duzy" | "slaby";

/**
 * Poziom zgodności dla podanego kontrastu. Progi WCAG 2.1:
 * tekst zwykły — AA ≥ 4.5, AAA ≥ 7; tekst duży (≥18.66 px pogrubiony lub ≥24 px) — AA ≥ 3, AAA ≥ 4.5.
 *
 * @param duzyTekst liczyć progi dla tekstu dużego (nagłówki), nie dla zwykłego
 */
export function wcagLevel(ratio: number, duzyTekst = false): PoziomWcag {
  if (duzyTekst) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA";
    return "slaby";
  }
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  // Kontrast 3–4.5 wystarcza WYŁĄCZNIE dla dużego tekstu — nazywamy to wprost, żeby panel nie
  // sugerował, że para nadaje się do treści.
  if (ratio >= 3) return "AA-duzy";
  return "slaby";
}

/** Czy para kolorów nadaje się pod tekst zwykłej wielkości (próg AA). */
export function czytelny(tlo: string, tekst: string): boolean {
  const r = contrastRatio(tlo, tekst);
  return r !== null && r >= 4.5;
}

/**
 * Kuratorowana lista krojów portalu.
 *
 * ŚWIADOMIE lista zamknięta, a nie dowolna nazwa z Google Fonts. Dwa powody, oba praktyczne:
 * (1) dowolna nazwa wchodzi do CSS, więc byłaby kolejnym miejscem na wstrzyknięcie deklaracji —
 *     dokładnie ten problem, który `safeMediaUrl` rozwiązuje dla `url()`;
 * (2) pobieranie kroju z zewnątrz w trakcie budowania/renderowania robi z cudzego serwisu część
 *     naszej ścieżki wdrożenia — 2026-08-16 rotacja plików po stronie Google wywróciła blokujący
 *     job `build` w siostrzanym repo trzy razy z rzędu, mimo że w kodzie nic się nie zmieniło.
 * Wartości to gotowe stosy CSS oparte o kroje systemowe — zero zapytań sieciowych, identyczny
 * wygląd offline i w OBS.
 */
export const PORTAL_FONTS = [
  { id: "system", stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "grotesk", stack: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "serif", stack: "ui-serif, Georgia, Cambria, 'Times New Roman', serif" },
  { id: "slab", stack: "'Rockwell', 'Courier Bold', Courier, Georgia, serif" },
  { id: "mono", stack: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" },
  { id: "rounded", stack: "'SF Pro Rounded', ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, sans-serif" },
] as const;

export type PortalFontId = (typeof PORTAL_FONTS)[number]["id"];

/**
 * Stos CSS dla identyfikatora kroju. Nieznana wartość → stos systemowy: to jedyne miejsce, które
 * decyduje, co trafia do `font-family`, więc wartość z bazy nigdy nie wchodzi do CSS wprost.
 */
export function fontStack(id: string | null | undefined): string {
  return PORTAL_FONTS.find((f) => f.id === id)?.stack ?? PORTAL_FONTS[0].stack;
}
