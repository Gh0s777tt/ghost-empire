// src/lib/disposable-email.ts
// Wykrywanie adresów jednorazowych — sygnał anty-multikonto dla skanu zmów. **Czysty**, bez sieci.
//
// PO CO ISTNIEJE: `economy-collusion.ts` świadomie ogranicza się do „danych, które JUŻ mamy",
// i dobrze — ale przez to nie patrzy na najmocniejszy pojedynczy sygnał sockpuppeta: **domenę
// adresu e-mail**. Farmienie poleceń, wash-trading dueli i zbieranie prezentów wymagają kont, a
// konta zakładane hurtem prawie zawsze idą z serwisu jednorazowych skrzynek.
//
// ⚠️ PRYWATNOŚĆ — to nie jest szczegół implementacyjny, tylko granica projektu:
// patrzymy WYŁĄCZNIE na **domenę**, nigdy na lokalną część adresu, i nigdzie jej nie wysyłamy
// poza sprawdzeniem samej domeny. Domena to informacja o dostawcy poczty, nie o osobie; adres
// nie opuszcza bazy. Wynik jest **flagą do przeglądu**, nigdy automatyczną karą — ta sama zasada,
// co w całym `economy-collusion` („v1 flags, no auto-punishment").
//
// Lista lokalna niżej jest **dnem, nie kompletem**: łapie najczęstsze serwisy bez ani jednego
// zapytania sieciowego, a `disposable-email-check.ts` dokłada opcjonalne odpytanie Disify dla
// domen spoza niej. Dzięki temu funkcja działa w pełni offline i tylko *poprawia się*, gdy sieć
// jest dostępna — nigdy od niej nie zależy.

/**
 * Najczęstsze domeny jednorazowe. Świadomie krótka i ręcznie utrzymywana.
 *
 * @remarks
 * Nie ma sensu przepisywać tu cudzej listy dziesiątek tysięcy domen — od tego jest Disify.
 * Ta garść pokrywa serwisy, na które trafia się realnie, i sprawia, że sygnał istnieje nawet
 * przy zerowej łączności.
 */
const DOMENY_JEDNORAZOWE: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "throwawaymail.com", "yopmail.com", "getnada.com", "dispostable.com",
  "trashmail.com", "fakeinbox.com", "maildrop.cc", "mailnesia.com",
  "mohmal.com", "moakt.com", "emailondeck.com", "spamgourmet.com",
  "mytemp.email", "tempmailo.com", "minuteinbox.com", "mail.tm",
]);

/**
 * Domena adresu, znormalizowana do porównań.
 *
 * @returns domena małymi literami albo `null`, gdy to nie wygląda na adres.
 * @remarks
 * Bierzemy fragment po OSTATNIM `@` — adres z `@` w części lokalnej (rzadki, ale poprawny)
 * nie może przez to wskazać złej domeny.
 */
export function domenaZEmaila(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const i = email.lastIndexOf("@");
  if (i < 1 || i === email.length - 1) return null;
  const d = email.slice(i + 1).trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/** Czy domena jest na lokalnej liście? Bez sieci — dno sygnału. */
export function czyJednorazowaLokalnie(domena: string | null): boolean {
  return domena !== null && DOMENY_JEDNORAZOWE.has(domena);
}

/** Ile domen zna lista lokalna — do diagnostyki i do testu, że nie skurczyła się przypadkiem. */
export const LICZBA_DOMEN_LOKALNYCH = DOMENY_JEDNORAZOWE.size;

export type KontoDoOceny = {
  userId: string;
  /** Domena, NIE pełny adres — patrz nota o prywatności w nagłówku. */
  domena: string | null;
  /** Ile kont z tej samej domeny ma ten portal (liczone przez wywołującego). */
  kontZDomeny: number;
  /** Czy konto wygląda na bezczynne — ta sama heurystyka, co przy poleconych. */
  nieaktywne: boolean;
};

export type FlagaKonta = {
  userId: string;
  domena: string;
  /** Im wyżej, tym pewniejszy sygnał. Do sortowania listy dla admina. */
  waga: number;
  powody: string[];
};

/** Od ilu kont z jednej domeny robi się to podejrzane samo w sobie (bez listy jednorazówek). */
export const PROG_KONT_Z_DOMENY = 5;

/**
 * Flaguje konta warte przejrzenia — jednorazowe domeny i nienaturalne skupiska.
 *
 * @param konta - wiersze przygotowane przez wywołującego (agregacja DB nie należy do czystej logiki).
 * @param jednorazoweZdalne - domeny uznane za jednorazowe przez Disify; puste = tylko lista lokalna.
 * @returns flagi posortowane malejąco po wadze.
 *
 * @remarks
 * Skupisko kont na JEDNEJ domenie liczy się osobno od listy jednorazówek, bo łapie własny serwer
 * pocztowy atakującego — taka domena nie będzie na żadnej publicznej liście. Duzi dostawcy
 * (gmail.com, outlook.com) mają setki kont w każdym normalnym portalu, więc samo skupisko bez
 * innego sygnału daje wagę niską: to podpowiedź do przejrzenia, nie oskarżenie.
 */
export function flagujKonta(
  konta: KontoDoOceny[],
  jednorazoweZdalne: ReadonlySet<string> = new Set(),
): FlagaKonta[] {
  const flagi: FlagaKonta[] = [];
  for (const k of konta) {
    if (!k.domena) continue;
    const jednorazowa = czyJednorazowaLokalnie(k.domena) || jednorazoweZdalne.has(k.domena);
    const skupisko = k.kontZDomeny >= PROG_KONT_Z_DOMENY;
    if (!jednorazowa && !skupisko) continue;

    const powody: string[] = [];
    let waga = 0;
    if (jednorazowa) {
      powody.push(`adres z serwisu jednorazowego (${k.domena})`);
      waga += 3;
    }
    if (skupisko) {
      powody.push(`${k.kontZDomeny} kont z tej samej domeny`);
      // Skupisko na domenie jednorazowej znaczy dużo więcej niż na gmailu.
      waga += jednorazowa ? 2 : 1;
    }
    if (k.nieaktywne) {
      powody.push("konto praktycznie bez aktywności");
      waga += 1;
    }
    flagi.push({ userId: k.userId, domena: k.domena, waga, powody });
  }
  return flagi.sort((a, b) => b.waga - a.waga || a.userId.localeCompare(b.userId));
}
