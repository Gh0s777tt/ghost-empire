// src/lib/list-filter.ts
// Client-side text filtering for long admin lists (#audit3 UX). Diacritic-insensitive
// (so "zolw" matches "Żółw") and token-AND (every whitespace-separated term must match),
// so typing more words narrows the result. Pure → unit-tested without a DOM.

/** Lowercase + strip diacritics for accent-insensitive search ("żółw" → "zolw"). */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // drop combining marks (U+0300–U+036F etc.)
    .toLowerCase()
    .replace(/ł/g, "l") // ł/Ł is a distinct letter with no combining form — fold it (Polish)
    .trim();
}

/**
 * True when every token in `query` is found somewhere in `parts`. An empty/whitespace
 * query matches everything (no filtering). null/undefined parts are ignored.
 */
export function matchesQuery(parts: (string | null | undefined)[], query: string): boolean {
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = normalizeForSearch(parts.filter(Boolean).join("  "));
  return tokens.every((tok) => hay.includes(tok));
}

/** Filter a list by free text, deriving each item's searchable parts via `getParts`. */
export function filterByText<T>(items: T[], query: string, getParts: (item: T) => (string | null | undefined)[]): T[] {
  if (!normalizeForSearch(query)) return items;
  return items.filter((it) => matchesQuery(getParts(it), query));
}
