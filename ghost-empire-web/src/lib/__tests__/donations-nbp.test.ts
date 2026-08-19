// Kursy NBP — parsowanie tabeli A i pułapki, przez które ten feed mógłby zepsuć ekonomię.
//
// Testy celują w konkretne sposoby, na jakie feed FX potrafi zaszkodzić bardziej niż jego brak:
// przyjęcie kursu „za 100 jednostek" jako kursu za jedną (over-mint ~100×), przyjęcie obciętej
// odpowiedzi jako pełnej tabeli, i BGN, którego NBP w tabeli A nie ma wcale.
import { describe, it, expect, vi } from "vitest";
import { parsujTabeleNbp, tabelaWiarygodna, pobierzKursyNbp, MIN_WALUT_W_TABELI } from "@/lib/donations/nbp";
import { plnFromMinor, isSupportedCurrency } from "@/lib/donations/fx";

/** Odpowiedź NBP w kształcie 1:1 z produkcyjnym (skrócona lista walut). */
function tabela(rates: Array<{ code: string; mid: number }>) {
  return [{ table: "A", no: "160/A/NBP/2026", effectiveDate: "2026-08-19", rates: rates.map((r) => ({ currency: "x", ...r })) }];
}

/** Pełna, wiarygodna tabela — `MIN_WALUT_W_TABELI` sztuk plus te, które testujemy z nazwy. */
function pelnaTabela(extra: Array<{ code: string; mid: number }> = []) {
  const wypelniacz = Array.from({ length: MIN_WALUT_W_TABELI }, (_, i) => ({ code: `X${i}`, mid: 1 + i / 100 }));
  return tabela([{ code: "EUR", mid: 4.3267 }, { code: "USD", mid: 3.7306 }, ...extra, ...wypelniacz]);
}

describe("parsujTabeleNbp", () => {
  it("czyta kursy i metadane wydania", () => {
    const { kursy, data, tabela: nr } = parsujTabeleNbp(pelnaTabela([{ code: "JPY", mid: 0.023438 }]));
    expect(kursy.USD).toBeCloseTo(3.7306, 4);
    expect(kursy.JPY).toBeCloseTo(0.023438, 6);
    expect(data).toBe("2026-08-19");
    expect(nr).toBe("160/A/NBP/2026");
  });

  it("PLN zawsze wynosi 1 (NBP nie notuje własnej waluty)", () => {
    expect(parsujTabeleNbp(pelnaTabela()).kursy.PLN).toBe(1);
  });

  // PUŁAPKA 1 — kurs „za 100 jednostek" podany jako kurs za jedną. Drukowane tabele NBP używają
  // przelicznika 100 dla jena i forinta; gdyby taki wiersz przeszedł, ¥1000 mintowałoby ~100× za
  // dużo. To dokładnie ta katastrofa, przed którą ostrzega nagłówek `fx.ts`.
  it("ODRZUCA kurs spoza rozsądnego zakresu zamiast go przyjąć", () => {
    const { kursy } = parsujTabeleNbp(pelnaTabela([{ code: "JPY", mid: 2.3438 * 100 }]));
    expect(kursy.JPY).toBeUndefined();
  });

  it("odrzuca też kurs zerowy, ujemny i nieliczbowy", () => {
    const { kursy } = parsujTabeleNbp(
      pelnaTabela([{ code: "AAA", mid: 0 }, { code: "BBB", mid: -1 }, { code: "CCC", mid: "4.0" as unknown as number }]),
    );
    expect(kursy.AAA).toBeUndefined();
    expect(kursy.BBB).toBeUndefined();
    expect(kursy.CCC).toBeUndefined();
  });

  // PUŁAPKA 2 — BGN nie ma w tabeli A. W tabeli B ostatni wpis pochodzi z 2007 r., więc ślepe
  // pobranie dałoby dziewiętnastoletni kurs. Lew jest sztywno związany z euro.
  it("wylicza BGN z EUR po sztywnym parytecie, nie bierze go z NBP", () => {
    const { kursy } = parsujTabeleNbp(pelnaTabela());
    expect(kursy.BGN).toBeCloseTo(4.3267 / 1.95583, 6);
  });

  it("bez EUR nie zgaduje BGN", () => {
    const { kursy } = parsujTabeleNbp(tabela([{ code: "USD", mid: 3.73 }]));
    expect(kursy.BGN).toBeUndefined();
  });

  it("śmieci na wejściu dają pustą mapę, nie wyjątek", () => {
    for (const zle of [null, undefined, {}, [], [{}], [{ rates: "nie-tablica" }], "tekst"]) {
      expect(parsujTabeleNbp(zle).kursy).toEqual({});
    }
  });
});

// PUŁAPKA 3 — odpowiedź obcięta (błąd sieci, strona błędu podana jako JSON) nie może zastąpić
// pełnej tabeli: kilka walut przeszłoby walidację pojedynczych wierszy, a reszta po cichu spadłaby
// na kursy statyczne — czyli mielibyśmy dwa różne kursy w jednym raporcie.
describe("tabelaWiarygodna", () => {
  it("odrzuca odpowiedź obciętą do kilku walut", () => {
    expect(tabelaWiarygodna(parsujTabeleNbp(tabela([{ code: "EUR", mid: 4.3 }, { code: "USD", mid: 3.7 }])).kursy)).toBe(false);
  });

  it("przyjmuje pełną tabelę", () => {
    expect(tabelaWiarygodna(parsujTabeleNbp(pelnaTabela()).kursy)).toBe(true);
  });

  it("odrzuca tabelę bez EUR albo bez USD, choćby długą", () => {
    const bezEur = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`X${i}`, 1]));
    expect(tabelaWiarygodna({ ...bezEur, USD: 3.7 })).toBe(false);
  });
});

describe("pobierzKursyNbp — zachowanie przy awarii", () => {
  it("zwraca null przy błędzie HTTP zamiast rzucać", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect(await pobierzKursyNbp(f as unknown as typeof fetch)).toBeNull();
  });

  it("zwraca null, gdy fetch rzuci (sieć/timeout)", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    expect(await pobierzKursyNbp(f as unknown as typeof fetch)).toBeNull();
  });

  it("zwraca null dla odpowiedzi 200 z niewiarygodną tabelą (nie zapisujemy śmieci)", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => tabela([{ code: "EUR", mid: 4.3 }]) });
    expect(await pobierzKursyNbp(f as unknown as typeof fetch)).toBeNull();
  });

  it("oddaje kursy dla poprawnej odpowiedzi", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => pelnaTabela() });
    const w = await pobierzKursyNbp(f as unknown as typeof fetch);
    expect(w?.kursy.USD).toBeCloseTo(3.7306, 4);
    expect(w?.tabela).toBe("160/A/NBP/2026");
  });
});

describe("plnFromMinor z żywymi kursami", () => {
  it("żywy kurs MA PIERWSZEŃSTWO nad tabelą statyczną", () => {
    // Statycznie USD = 4.0; NBP na dzień wdrożenia = 3.7306. $10 to 37,31 PLN, nie 40.
    expect(plnFromMinor(1000, "USD", { USD: 3.7306 })).toBeCloseTo(37.306, 3);
    expect(plnFromMinor(1000, "USD")).toBeCloseTo(40, 3);
  });

  it("waluta nieobecna w żywych kursach spada na tabelę statyczną, a nie na null", () => {
    expect(plnFromMinor(1000, "USD", { EUR: 4.33 })).toBeCloseTo(40, 3);
  });

  it("zachowuje zerowe miejsca dziesiętne dla JPY przy żywym kursie", () => {
    // 1000 JPY to 1000 CAŁYCH jenów, nie 10.00 — pomyłka tutaj to over-mint 100×.
    expect(plnFromMinor(1000, "JPY", { JPY: 0.023438 })).toBeCloseTo(23.438, 3);
  });

  it("waluta znana WYŁĄCZNIE z NBP staje się obsługiwana", () => {
    expect(isSupportedCurrency("ISK")).toBe(false);
    expect(isSupportedCurrency("ISK", { ISK: 0.11 })).toBe(true);
    expect(plnFromMinor(10_000, "ISK", { ISK: 0.11 })).toBeCloseTo(11, 3);
  });

  it("nieznana nigdzie waluta nadal daje null (nie zgadujemy kursu)", () => {
    expect(plnFromMinor(1000, "XYZ", { USD: 3.73 })).toBeNull();
  });

  it("pusta mapa kursów zachowuje się dokładnie jak brak parametru", () => {
    for (const kod of ["USD", "EUR", "JPY", "PLN"]) {
      expect(plnFromMinor(1000, kod, {})).toBe(plnFromMinor(1000, kod));
    }
  });
});
