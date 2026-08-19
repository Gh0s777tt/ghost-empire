// src/lib/disposable-email-check.ts
// Opcjonalne wzbogacenie sygnału jednorazowych adresów przez **Disify** — serwerowa połowa
// `disposable-email.ts` (czysta lista lokalna + czyste flagowanie mieszkają tam).
//
// PO CO OSOBNY PLIK: `disposable-email.ts` musi zostać czysty i działać bez sieci, bo od niego
// zależy sygnał anty-multikonto. Tutaj mieszka wszystko, co może zawieść: fetch, timeout, cache.
//
// ⚠️ WYSYŁAMY WYŁĄCZNIE DOMENĘ, nigdy pełnego adresu. Disify przyjmuje samą domenę
// (`/domain/<domena>`), więc żaden adres użytkownika nie opuszcza naszej bazy. To granica
// projektu, nie optymalizacja — patrz nota o prywatności w `disposable-email.ts`.
//
// FAIL-OPEN, i to świadomie: brak odpowiedzi znaczy „nie wiem", czyli domena po prostu nie dostaje
// dodatkowej flagi. Skan zmów to narzędzie do PRZEGLĄDU dla admina, więc niedostępność zewnętrznej
// usługi nie może ani zablokować skanu, ani — tym bardziej — oznaczyć kogoś jako oszusta.
import { cacheJson } from "@/lib/redis";
import { czyJednorazowaLokalnie } from "./disposable-email";

/** 30 dni — status domeny to fakt o dostawcy poczty, zmienia się w skali miesięcy, nie godzin. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Ile domen maksymalnie odpytujemy w jednym skanie — reszta jedzie na liście lokalnej. */
export const LIMIT_ZAPYTAN = 25;

const BAZA = "https://disify.com/api/domain";

/**
 * Czy Disify uznaje tę domenę za jednorazową?
 *
 * @returns `true`/`false` z odpowiedzi, albo `null` gdy nie udało się ustalić.
 * @remarks Zwraca `null`, nie `false` — „nie wiem" i „na pewno nie" to różne rzeczy dla wywołującego.
 */
async function sprawdzDomene(domena: string, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4_000);
  try {
    const r = await fetchImpl(`${BAZA}/${encodeURIComponent(domena)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { disposable?: unknown };
    return typeof d?.disposable === "boolean" ? d.disposable : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Rozstrzyga zestaw domen: zwraca te uznane za jednorazowe.
 *
 * @param domeny - unikalne domeny do sprawdzenia.
 * @returns zbiór domen jednorazowych wg Disify (bez tych z listy lokalnej — te i tak są znane).
 *
 * @remarks
 * Domeny z listy lokalnej **pomijamy**, bo odpowiedź już znamy — to oszczędza zapytania i sprawia,
 * że limit `LIMIT_ZAPYTAN` idzie wyłącznie na domeny naprawdę nieznane. Wynik każdej domeny jest
 * cache'owany osobno i **wspólnie dla całej platformy**: `mailinator.com` jest jednorazowy dla
 * każdego portalu, więc nie ma powodu pytać o niego więcej niż raz na miesiąc.
 */
export async function jednorazoweWgDisify(
  domeny: Iterable<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  const doSprawdzenia = [...new Set(domeny)].filter((d) => !czyJednorazowaLokalnie(d)).slice(0, LIMIT_ZAPYTAN);
  const wynik = new Set<string>();

  const odpowiedzi = await Promise.all(
    doSprawdzenia.map(async (d) => {
      // „Nie wiem" NIE MOŻE trafić do cache'u — inaczej jedna awaria sieci zapisałaby
      // „ta domena jest w porządku" na 30 dni. `cacheJson` zapisuje dopiero wynik producenta,
      // więc rzucamy przed zapisem i łapiemy na zewnątrz; nierozstrzygnięta domena będzie
      // spróbowana ponownie przy następnym skanie.
      const zCache = await cacheJson<boolean>(`disposable:${d}`, TTL_MS, async () => {
        const v = await sprawdzDomene(d, fetchImpl);
        if (v === null) throw new Error("disify: brak rozstrzygnięcia");
        return v;
      }).catch(() => null);
      return [d, zCache] as const;
    }),
  );

  for (const [d, jednorazowa] of odpowiedzi) if (jednorazowa === true) wynik.add(d);
  return wynik;
}
