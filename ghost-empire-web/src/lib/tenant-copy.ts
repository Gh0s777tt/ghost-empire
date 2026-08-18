// src/lib/tenant-copy.ts
// Nadpisania treści per portal (update 2026-08) — zamknięta lista pól + walidacja + rozwiązywanie.
//
// Po co istnieje: `welcome`/`about` pochodziły wyłącznie ze wspólnych `src/messages/*.json`, więc
// każdy portal wyglądał inaczej, ale MÓWIŁ dokładnie to samo. To był sufit white-label — streamer
// nie mógł opisać własnej społeczności swoimi słowami. Ten moduł mówi, CO wolno nadpisać, jak długi
// może być tekst i jak nadpisanie łączy się z domyślnym tłumaczeniem.
//
// Czysta logika, zero zależności — testowana bez mocków (konwencja repo dla `src/lib/*`).

/**
 * ZAMKNIĘTA lista pól, które portal może nadpisać.
 *
 * Świadomie lista, a nie „dowolny klucz z katalogu i18n". Trzy powody:
 * (1) baza nie staje się workiem na dowolne dane — klucz spoza listy jest odrzucany przy zapisie;
 * (2) nadpisanie klucza PRAWNEGO (`terms`, `privacy`) byłoby obejściem regulaminu, który wg
 *     CLAUDE.md podlega polskiemu prawu i przeglądowi prawnika — te namespace'y NIE są tu obecne
 *     i obecne być nie mogą;
 * (3) limit długości per pole trzyma layout w ryzach: nagłówek na pół ekranu rozwala stronę
 *     powitalną tak samo skutecznie jak zły kolor.
 */
export const EDITABLE_COPY = [
  { key: "welcome.sub1pre", max: 200 },
  // UWAGA: domyślne tłumaczenie tego pola niesie pogrubienie (`t.rich`). Nadpisanie portalu jest
  // zwykłym tekstem, więc gdy jest ustawione, strona renderuje je BEZ formatowania — świadomie,
  // zamiast udawać, że tagi w polu tekstowym zadziałają.
  { key: "welcome.sub2", max: 300 },
  { key: "welcome.hlTokens", max: 60 },
  { key: "welcome.hlTokensDesc", max: 240 },
  { key: "welcome.hlRewards", max: 60 },
  { key: "welcome.hlRewardsDesc", max: 240 },
  { key: "welcome.hlCompete", max: 60 },
  { key: "welcome.hlCompeteDesc", max: 240 },
  { key: "welcome.hlBot", max: 60 },
  { key: "welcome.hlBotDesc", max: 240 },
  { key: "welcome.hlExt", max: 60 },
  { key: "welcome.hlExtDesc", max: 240 },
] as const;

export type EditableCopyKey = (typeof EDITABLE_COPY)[number]["key"];

const BY_KEY = new Map(EDITABLE_COPY.map((e) => [e.key as string, e]));

/** Czy klucz wolno nadpisać. Wszystko spoza listy odpada — patrz komentarz przy `EDITABLE_COPY`. */
export function isEditableCopyKey(key: string): key is EditableCopyKey {
  return BY_KEY.has(key);
}

/** Górny limit długości dla pola; `null` dla klucza spoza listy. */
export function copyMaxLength(key: string): number | null {
  return BY_KEY.get(key)?.max ?? null;
}

export type WynikWalidacji =
  | { ok: true; value: string | null }
  | { ok: false; powod: "nieznany-klucz" | "za-dlugie" };

/**
 * Sprawdza i normalizuje jedno nadpisanie przed zapisem.
 *
 * Pusty tekst (lub same białe znaki) daje `value: null`, co znaczy „skasuj nadpisanie i wróć do
 * tłumaczenia domyślnego" — to jedyny sposób na cofnięcie zmiany, więc nie może być błędem.
 *
 * @param key klucz z `EDITABLE_COPY`
 * @param raw tekst od użytkownika (może zawierać markery `%tokenName%` — rozwiązywane przy odczycie)
 */
export function walidujCopy(key: string, raw: string): WynikWalidacji {
  const wpis = BY_KEY.get(key);
  if (!wpis) return { ok: false, powod: "nieznany-klucz" };
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  if (v.length > wpis.max) return { ok: false, powod: "za-dlugie" };
  return { ok: true, value: v };
}

/**
 * Łączy nadpisania portalu z tłumaczeniem domyślnym.
 *
 * Kolejność jest celowa: nadpisanie wygrywa, ale TYLKO gdy jest niepuste. Portal, który wyczyścił
 * pole, ma zobaczyć tekst domyślny, a nie pustkę — inaczej jedno nieuważne kliknięcie zostawiłoby
 * dziurę na stronie powitalnej.
 *
 * @param overrides mapa `klucz → wartość` z bazy (dla jednego portalu i jednego locale)
 * @param fallback funkcja zwracająca tłumaczenie domyślne (zwykle `t()` z next-intl)
 */
export function resolveCopy(
  overrides: ReadonlyMap<string, string>,
  key: string,
  fallback: (k: string) => string,
): string {
  const own = overrides.get(key);
  if (typeof own === "string" && own.trim() !== "") return own;
  // Klucz w bazie zapisujemy z namespace'em („welcome.sub2"), a `t()` dostaje sam ogon („sub2") —
  // funkcja fallback jest już zwykle związana z namespace'em przez `getTranslations("welcome")`.
  return fallback(key.includes(".") ? key.slice(key.indexOf(".") + 1) : key);
}
