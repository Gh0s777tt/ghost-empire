// Typy publicznego API skryptu bramki (check-white-label.mjs).
// Skrypt jest zwykłym .mjs (odpalany node'em bez transpilacji), więc jego funkcje
// potrzebują deklaracji, żeby test w src/__tests__ mógł je zaimportować pod
// `tsc --noEmit`.

/** Pojedynczy wyciek marki/waluty foundera w tekście widocznym dla widza. */
export type WhiteLabelFinding = {
  /** Plik, w którym znaleziono wyciek. */
  file: string;
  /** Numer linii (1-indexed). */
  line: number;
  /** Co wyciekło (opis dla człowieka). */
  what: string;
  /** Czym to zastąpić. */
  fix: string;
  /** Przycięty tekst literału. */
  text: string;
};

/** Literał stringa wyciągnięty ze źródła wraz z numerem linii. */
export type ExtractedLiteral = { line: number; text: string };

/**
 * Wyciąga literały stringów ('…', "…", `…` wraz z kawałkami wokół ${…}) ze
 * źródła TS/JS, pomijając komentarze, kod i literały regexowe.
 */
export function extractLiterals(src: string): ExtractedLiteral[];

/** Skanuje zawartość jednego pliku i zwraca znalezione wycieki. */
export function scanText(text: string, file?: string): WhiteLabelFinding[];

/** Wzorce marki/waluty foundera, których nie wolno wpisywać literałem. */
export const PATTERNS: { re: RegExp; what: string; fix: string }[];
