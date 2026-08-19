// src/lib/holidays.ts
// Święta państwowe per kraj — czysta logika pod kafelki „odpal event świąteczny" w panelu.
//
// PO CO ISTNIEJE: `HolidayEventsCard` miała **sześć zaszytych świąt** (walentynki, Halloween,
// Wielkanoc, Boże Narodzenie, Dzień Kobiet, sylwester) — kulturowo polsko-zachodnich. Przy modelu
// white-label, gdzie portal zakłada dowolny streamer, Japończyk czy Indonezyjczyk dostawał cudzy
// kalendarz i ani jednego własnego święta. To wprost łamie zasadę „every feature is a platform
// feature": funkcja działała dobrze wyłącznie dla portalu założyciela.
//
// Źródłem jest **Nager.Date** — darmowe, bez klucza, 204 kraje (sprawdzone: pokrywa wszystkie 14
// locale aplikacji). Zwraca `localName` w języku kraju, więc niemiecki portal widzi „Tag der
// Deutschen Einheit", a nie „German Unity Day".
//
// Te święta **UZUPEŁNIAJĄ** zaszyte sześć, a nie zastępują: Halloween i walentynki nie są świętami
// państwowymi nigdzie, więc żadne API ich nie zwróci — a to właśnie one najlepiej działają jako
// eventy w społeczności streamera.

/** Święto państwowe w kształcie, jaki oddaje Nager.Date (tylko pola, których używamy). */
export type Swieto = {
  /** `YYYY-MM-DD` — dzień obowiązywania. */
  data: string;
  /** Nazwa w języku kraju (np. „Wszystkich Świętych"). */
  nazwaLokalna: string;
  /** Nazwa angielska — zapasowa, gdy lokalnej brak. */
  nazwaEn: string;
  /** Czy obowiązuje w CAŁYM kraju. `false` = regionalne (Nager podaje wtedy `counties`). */
  ogolnokrajowe: boolean;
};

/**
 * Domyślny kraj dla locale panelu.
 *
 * @remarks
 * Mapa jest jawna i krótka, bo **locale to nie kraj**: `en` może znaczyć Wielką Brytanię albo USA,
 * `ar` — kilkanaście państw. Wybieramy jeden rozsądny domyślny, a panel i tak pozwala go zmienić;
 * zgadywanie z `navigator` albo strefy czasowej dawałoby gorsze wyniki przy większym koszcie.
 * Nieznane locale → `null`, czyli „poproś o wybór", zamiast po cichu podstawić Polskę.
 */
const KRAJ_DLA_LOCALE: Readonly<Record<string, string>> = {
  pl: "PL", en: "GB", de: "DE", es: "ES", fr: "FR", it: "IT", pt: "PT",
  ru: "RU", uk: "UA", zh: "CN", ja: "JP", ko: "KR", ar: "EG", id: "ID",
};

/** Domyślny kod kraju (ISO 3166-1 alpha-2) dla danego locale, albo `null` gdy nie wiemy. */
export function krajDlaLocale(locale: string): string | null {
  return KRAJ_DLA_LOCALE[locale.slice(0, 2).toLowerCase()] ?? null;
}

/** Czy to sensowny kod kraju do wysłania w URL-u? Chroni przed wstrzyknięciem ścieżki. */
export function poprawnyKodKraju(kod: unknown): kod is string {
  return typeof kod === "string" && /^[A-Za-z]{2}$/.test(kod);
}

type WierszNager = {
  date?: unknown; localName?: unknown; name?: unknown; global?: unknown; counties?: unknown;
};

/**
 * Zamienia odpowiedź Nager.Date na listę świąt. **Czysta** — bez sieci.
 *
 * @remarks
 * Wiersz bez daty w formacie `YYYY-MM-DD` albo bez żadnej nazwy jest **pomijany**, nie naprawiany:
 * kafelek eventu bierze stąd nazwę i datę startu, więc śmieć na wejściu zrobiłby event „undefined"
 * z nieprawidłowym terminem. Regionalne (`global: false`) zostają, ale są oznaczone — decyzję,
 * czy odpalać event na święto jednego landu, zostawiamy właścicielowi portalu.
 */
export function parsujSwieta(dane: unknown): Swieto[] {
  if (!Array.isArray(dane)) return [];
  const out: Swieto[] = [];
  for (const w of dane as WierszNager[]) {
    const data = typeof w?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : null;
    const lokalna = typeof w?.localName === "string" ? w.localName.trim() : "";
    const en = typeof w?.name === "string" ? w.name.trim() : "";
    if (!data || (!lokalna && !en)) continue;
    out.push({
      data,
      nazwaLokalna: lokalna || en,
      nazwaEn: en || lokalna,
      // `global` bywa nieobecne w starszych odpowiedziach — brak `counties` też znaczy „cały kraj".
      ogolnokrajowe: w?.global === true || (w?.global === undefined && !Array.isArray(w?.counties)),
    });
  }
  return out;
}

/**
 * Święta wypadające w najbliższych `dni` dniach, od najbliższego.
 *
 * @param teraz - punkt odniesienia (wstrzykiwany w testach; domyślnie „dziś").
 * @remarks
 * Porównujemy **dni kalendarzowe**, nie znaczniki czasu: święto „dzisiaj" ma zostać na liście przez
 * cały swój dzień, a nie zniknąć o 00:01, bo streamer odpala event rano w dniu święta.
 */
export function nadchodzace(swieta: Swieto[], dni = 60, teraz: Date = new Date()): Swieto[] {
  const dzisiaj = teraz.toISOString().slice(0, 10);
  const granica = new Date(teraz.getTime() + dni * 86_400_000).toISOString().slice(0, 10);
  return swieta
    .filter((s) => s.data >= dzisiaj && s.data <= granica)
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Ile dni do święta (0 = dziś). Ujemne nie występuje, bo `nadchodzace` odsiewa przeszłość. */
export function dniDo(swieto: Swieto, teraz: Date = new Date()): number {
  const a = Date.parse(`${swieto.data}T00:00:00Z`);
  const b = Date.parse(`${teraz.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export const NAGER_BAZA = "https://date.nager.at/api/v3";

/** Adres listy nadchodzących świąt dla kraju. Kod jest walidowany przez wywołującego. */
export function urlSwiat(kraj: string): string {
  return `${NAGER_BAZA}/NextPublicHolidays/${kraj.toUpperCase()}`;
}
