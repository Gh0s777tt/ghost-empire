// src/lib/donations/nbp.ts
// Kursy walut z Narodowego Banku Polskiego — żywy feed pod `donations/fx.ts`.
//
// PO CO ISTNIEJE: `fx.ts` niósł kursy WPISANE NA SZTYWNO i sam to przyznawał („we have no FX
// feed"), a komunikat błędu prosił człowieka o ręczną edycję pliku. Zmierzone na dzień wdrożenia
// odchylenie od kursu NBP: **TRY −29 %**, UAH −17 %, JPY −13 %, USD −7 %. Kursy sterują wielkością
// grantu waluty portalu za realną wpłatę, więc martwa tabela po cichu mintuje za dużo albo za mało.
//
// DLACZEGO NBP, a nie dowolny darmowy feed FX: operator jest polski, a polskie prawo podatkowe do
// przeliczeń walutowych używa **kursu średniego NBP**. Ten sam kurs w produkcie i w księgowości
// znaczy, że raport z panelu zgadza się z tym, co idzie do rozliczenia. API jest darmowe, bez
// klucza i bez limitu zapytań.
//
// ⚠️ TRZY PUŁAPKI, każda sprawdzona, nie założona:
//
//  1. **Tabela A publikowana jest tylko w dni robocze.** W weekend i święta nie ma nowego wpisu,
//     więc feed MUSI mieć cache ostatniego znanego kursu — inaczej co sobotę wracalibyśmy do
//     tabeli statycznej. Stąd długi TTL (26 h) i osobny, długowieczny „ostatni znany" klucz.
//
//  2. **BGN nie jest w tabeli A.** Siedzi w tabeli B, a tam ostatni wpis pochodzi z **2007 roku**
//     (`13/B/NBP/2007`) — ślepe pobranie dałoby dziewiętnastoletni kurs. Lew jest sztywno związany
//     z euro (1 EUR = 1,95583 BGN), więc wyliczamy go z EUR. To jedyny kurs pochodny i jedyny,
//     który NIE pochodzi wprost z NBP.
//
//  3. **JSON API podaje kurs za JEDNĄ jednostkę**, mimo że drukowane tabele NBP dla jena czy
//     forinta używają przelicznika 100. Sprawdzone arytmetycznie (USD/JPY ≈ 150 → 1 JPY ≈ 0,025 PLN,
//     a API zwraca 0,0234 — czyli za 1, nie za 100). Pomyłka o dwa rzędy w tę stronę to dokładnie
//     ta katastrofa, przed którą ostrzega nagłówek `fx.ts`, więc `parsujTabeleNbp` odrzuca kursy
//     spoza rozsądnego zakresu zamiast je przyjąć.
//
// Podział na czyste `parsujTabeleNbp` (bez sieci, unit-testowane) i `pobierzKursyNbp` (fetch)
// to konwencja repo: logika w `src/lib/*` ma być testowalna bez mocków sieci.

/** Kurs w PLN za JEDNĄ jednostkę waluty, kluczowany kodem ISO. */
export type KursyPln = Record<string, number>;

/** Sztywny parytet lewa do euro — Bułgaria trzyma currency board od 1999 r. */
const BGN_ZA_EUR = 1.95583;

/**
 * Granice zdrowego rozsądku dla kursu PLN za jednostkę.
 *
 * @remarks
 * Nie jest to kosmetyka. Feed podający kurs „za 100 jednostek" dałby wartości ~100× większe, a
 * feed w innej walucie bazowej — ~4× mniejsze. Odrzucamy takie wiersze zamiast mintować z nich
 * walutę portalu. Zakres jest szeroki celowo: KRW to ~0,0027 PLN, a KWD ~12 PLN.
 */
const MIN_KURS = 0.0001;
const MAX_KURS = 100;

type WierszNbp = { code?: unknown; mid?: unknown };
type TabelaNbp = { rates?: unknown; effectiveDate?: unknown; no?: unknown };

/**
 * Zamienia odpowiedź `/api/exchangerates/tables/A` na mapę kursów. **Czysta** — bez sieci.
 *
 * @param dane - sparsowany JSON z NBP (tablica z jedną tabelą).
 * @returns `{ kursy, data, tabela }`; `kursy` jest puste, gdy odpowiedź nie ma sensu.
 *
 * @remarks
 * Wiersz bez kodu, bez liczbowego `mid` albo z kursem spoza `[MIN_KURS, MAX_KURS]` jest
 * **pomijany**, nie naprawiany — lepiej spaść na kurs statyczny dla jednej waluty niż wpuścić
 * do ekonomii liczbę, której nie rozumiemy. PLN dokładany jest zawsze jako 1.
 */
export function parsujTabeleNbp(dane: unknown): { kursy: KursyPln; data: string | null; tabela: string | null } {
  const pusty = { kursy: {} as KursyPln, data: null, tabela: null };
  if (!Array.isArray(dane) || dane.length === 0) return pusty;
  const tabela = dane[0] as TabelaNbp;
  if (!tabela || !Array.isArray(tabela.rates)) return pusty;

  const kursy: KursyPln = { PLN: 1 };
  for (const w of tabela.rates as WierszNbp[]) {
    const kod = typeof w?.code === "string" ? w.code.toUpperCase() : null;
    const mid = typeof w?.mid === "number" ? w.mid : null;
    if (!kod || mid === null || !Number.isFinite(mid)) continue;
    if (mid < MIN_KURS || mid > MAX_KURS) continue;
    kursy[kod] = mid;
  }
  // BGN wyliczany z EUR — patrz pułapka (2) w nagłówku.
  if (kursy.EUR) kursy.BGN = kursy.EUR / BGN_ZA_EUR;

  return {
    kursy,
    data: typeof tabela.effectiveDate === "string" ? tabela.effectiveDate : null,
    tabela: typeof tabela.no === "string" ? tabela.no : null,
  };
}

/** Ile walut musi się sparsować, żeby uznać tabelę za wiarygodną (NBP tabela A ma ich ~32). */
export const MIN_WALUT_W_TABELI = 20;

/**
 * Czy sparsowana tabela nadaje się do użycia?
 *
 * @remarks
 * Osobna funkcja, bo to decyzja „ufamy czy nie", a nie szczegół parsowania: odpowiedź obcięta do
 * paru wierszy (błąd sieci, strona błędu podana jako JSON) nie może zastąpić pełnej tabeli.
 */
export function tabelaWiarygodna(kursy: KursyPln): boolean {
  return Object.keys(kursy).length >= MIN_WALUT_W_TABELI && kursy.EUR > 0 && kursy.USD > 0;
}

export const NBP_TABELA_A = "https://api.nbp.pl/api/exchangerates/tables/A?format=json";

/**
 * Pobiera i parsuje tabelę A z NBP.
 *
 * @param fetchImpl - wstrzykiwane w testach; domyślnie globalny `fetch`.
 * @returns kursy + metadane tabeli, albo `null` gdy NBP nie odpowiedział lub dał śmieci.
 *
 * @remarks
 * Zwraca `null` zamiast rzucać — wywołujący (cron) ma to zalogować i **zostawić poprzedni kurs**,
 * a nie wywalić zadania. Timeout 8 s: to zadanie w tle, nie ścieżka użytkownika, ale wisieć też
 * nie może.
 */
export async function pobierzKursyNbp(
  fetchImpl: typeof fetch = fetch,
): Promise<{ kursy: KursyPln; data: string | null; tabela: string | null } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const r = await fetchImpl(NBP_TABELA_A, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const wynik = parsujTabeleNbp(await r.json());
    return tabelaWiarygodna(wynik.kursy) ? wynik : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
