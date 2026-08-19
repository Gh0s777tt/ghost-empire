// src/lib/donations/fx-store.ts
// Serwerowa połowa feedu kursów — przechowywanie i odczyt. Wydzielone z `nbp.ts` (czyste
// parsowanie) i `fx.ts` (czysta arytmetyka), bo tylko tutaj mieszka Redis.
//
// Klucz projektowy: DWA klucze cache'u, nie jeden.
//
//  · `KLUCZ_DZIENNY` z TTL 26 h mówi „mamy dzisiejszy kurs" i steruje tym, czy cron ma w ogóle
//    ruszać NBP (drugie uruchomienie tego samego dnia jest no-opem).
//  · `KLUCZ_OSTATNI` **bez TTL** trzyma ostatnią udaną tabelę i jest tym, z czego naprawdę
//    liczymy. Bez niego każdy weekend i każde święto cofałyby ekonomię do tabeli statycznej —
//    NBP publikuje wyłącznie w dni robocze, więc „brak świeżego kursu" to stan NORMALNY, nie awaria.
//
// Fail-open jest tu świadomy: brak Redisa albo pusty cache oznacza `{}`, a `plnFromMinor` spada
// wtedy na statyczną tabelę z `fx.ts`. Wolimy policzyć grant przybliżonym kursem niż wstrzymać
// księgowanie wszystkich wpłat — to ta sama zasada, co przy `getTenantCopy`.
import { redis } from "@/lib/redis";
import type { KursyPln } from "./nbp";

const KLUCZ_DZIENNY = "fx:nbp:dzienny";
const KLUCZ_OSTATNI = "fx:nbp:ostatni";

/** 26 h, nie 24 — cron chodzi raz dziennie, a margines chroni przed wyścigiem na granicy doby. */
export const TTL_DZIENNY_MS = 26 * 60 * 60 * 1000;

/** Co siedzi w cache'u — kursy plus metadane tabeli, żeby panel mógł pokazać „z kiedy" kurs. */
export type ZapisKursow = {
  kursy: KursyPln;
  /** Dzień obowiązywania tabeli wg NBP (YYYY-MM-DD), nie moment pobrania. */
  data: string | null;
  /** Numer tabeli NBP, np. `160/A/NBP/2026` — jednoznacznie identyfikuje wydanie. */
  tabela: string | null;
  /** Kiedy zapisaliśmy (ISO) — do diagnostyki „kurs się nie odświeża". */
  zapisano: string;
};

/**
 * Ostatnie znane kursy — to z nich liczy produkt.
 *
 * @returns zapis albo `null`, gdy nigdy nic nie zapisaliśmy (świeże wdrożenie, brak Redisa).
 * @remarks Nigdy nie rzuca: padnięty Redis to `null`, czyli spadek na tabelę statyczną.
 */
export async function odczytajKursy(): Promise<ZapisKursow | null> {
  if (!redis) return null;
  try {
    return (await redis.get<ZapisKursow>(KLUCZ_OSTATNI)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Same kursy, w formie przyjmowanej przez `plnFromMinor(…, kursy)`.
 *
 * @returns mapa kursów albo `{}` — a puste wejście znaczy dla `fx.ts` „użyj tabeli statycznej".
 */
export async function kursyDoPrzeliczen(): Promise<KursyPln> {
  return (await odczytajKursy())?.kursy ?? {};
}

/** Czy dzisiejsze pobranie już się udało? Pozwala cronowi nie dobijać NBP bez potrzeby. */
export async function maSwiezeKursy(): Promise<boolean> {
  if (!redis) return false;
  try {
    return (await redis.get<string>(KLUCZ_DZIENNY)) !== null;
  } catch {
    return false;
  }
}

/**
 * Zapisuje świeżo pobraną tabelę.
 *
 * @remarks
 * `KLUCZ_OSTATNI` idzie **bez TTL** celowo — ma przetrwać weekend, święta i dłuższą awarię NBP.
 * Stary kurs jest zawsze lepszy od braku kursu, bo brak oznacza cofnięcie się do tabeli, która
 * na dzień wdrożenia myliła się o 29 % na lirze.
 */
export async function zapiszKursy(zapis: Omit<ZapisKursow, "zapisano">): Promise<void> {
  if (!redis) return;
  const pelny: ZapisKursow = { ...zapis, zapisano: new Date().toISOString() };
  try {
    await redis.set(KLUCZ_OSTATNI, pelny);
    await redis.set(KLUCZ_DZIENNY, pelny.data ?? "1", { px: TTL_DZIENNY_MS });
  } catch {
    /* Redis padł — następny przebieg crona spróbuje ponownie; produkt jedzie na poprzednim kursie. */
  }
}
