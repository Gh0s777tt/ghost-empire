// Święta państwowe per kraj — parsowanie odpowiedzi Nager.Date i wybór nadchodzących.
//
// Testy celują w to, czym ta funkcja może zaszkodzić: eventem o nazwie „undefined”, eventem
// z nieprawidłową datą startu, oraz cichym podstawieniem Polski portalowi z innego kraju —
// bo to ostatnie jest dokładnie tym defektem, który ta zmiana naprawia.
import { describe, it, expect } from "vitest";
import { parsujSwieta, nadchodzace, dniDo, krajDlaLocale, poprawnyKodKraju, urlSwiat } from "@/lib/holidays";

const TERAZ = new Date("2026-08-19T10:00:00Z");

/** Wiersz w kształcie 1:1 z produkcyjnym Nager.Date. */
const wiersz = (o: Record<string, unknown>) => ({
  date: "2026-11-01", localName: "Wszystkich Świętych", name: "All Saints' Day",
  countryCode: "PL", fixed: false, global: true, counties: null, launchYear: null, types: ["Public"],
  ...o,
});

describe("parsujSwieta", () => {
  it("czyta datę i obie nazwy", () => {
    const [s] = parsujSwieta([wiersz({})]);
    expect(s.data).toBe("2026-11-01");
    expect(s.nazwaLokalna).toBe("Wszystkich Świętych");
    expect(s.nazwaEn).toBe("All Saints' Day");
    expect(s.ogolnokrajowe).toBe(true);
  });

  it("nazwa LOKALNA ma pierwszeństwo — niemiecki portal ma widzieć niemiecką nazwę", () => {
    const [s] = parsujSwieta([wiersz({ localName: "Tag der Deutschen Einheit", name: "German Unity Day" })]);
    expect(s.nazwaLokalna).toBe("Tag der Deutschen Einheit");
  });

  it("brak nazwy lokalnej spada na angielską, nie na pusty string", () => {
    const [s] = parsujSwieta([wiersz({ localName: "" })]);
    expect(s.nazwaLokalna).toBe("All Saints' Day");
  });

  // Kafelek bierze stąd datę startu eventu — data w złym formacie dałaby event z nieprawidłowym
  // terminem, a nie widoczny błąd.
  it("POMIJA wiersz z datą w złym formacie", () => {
    for (const zla of ["01-11-2026", "2026/11/01", "jutro", "", null, 20261101]) {
      expect(parsujSwieta([wiersz({ date: zla })])).toEqual([]);
    }
  });

  it("POMIJA wiersz bez żadnej nazwy (event „undefined” nie ma sensu)", () => {
    expect(parsujSwieta([wiersz({ localName: "", name: "" })])).toEqual([]);
    expect(parsujSwieta([wiersz({ localName: null, name: undefined })])).toEqual([]);
  });

  it("oznacza święto regionalne zamiast je ukrywać", () => {
    const [s] = parsujSwieta([wiersz({ global: false, counties: ["DE-BY"] })]);
    expect(s.ogolnokrajowe).toBe(false);
  });

  it("brak pola `global` traktuje jak ogólnokrajowe, gdy nie ma `counties`", () => {
    const [s] = parsujSwieta([wiersz({ global: undefined, counties: null })]);
    expect(s.ogolnokrajowe).toBe(true);
  });

  it("śmieci na wejściu dają pustą listę, nie wyjątek", () => {
    for (const zle of [null, undefined, {}, "tekst", 42, [{}], [null]]) {
      expect(parsujSwieta(zle)).toEqual([]);
    }
  });
});

describe("nadchodzace", () => {
  const s = (data: string) => ({ data, nazwaLokalna: "x", nazwaEn: "x", ogolnokrajowe: true });

  it("odsiewa przeszłość i sortuje od najbliższego", () => {
    const w = nadchodzace([s("2026-12-25"), s("2026-01-01"), s("2026-09-01")], 200, TERAZ);
    expect(w.map((x) => x.data)).toEqual(["2026-09-01", "2026-12-25"]);
  });

  // Święto „dzisiaj” musi zostać przez cały swój dzień: streamer odpala event rano W DNIU święta.
  it("ZOSTAWIA święto wypadające dzisiaj", () => {
    expect(nadchodzace([s("2026-08-19")], 60, TERAZ)).toHaveLength(1);
  });

  it("respektuje okno w dniach", () => {
    expect(nadchodzace([s("2026-10-19")], 30, TERAZ)).toHaveLength(0);
    expect(nadchodzace([s("2026-10-19")], 90, TERAZ)).toHaveLength(1);
  });

  it("dniDo liczy dni kalendarzowe, z zerem dla dzisiaj", () => {
    expect(dniDo(s("2026-08-19"), TERAZ)).toBe(0);
    expect(dniDo(s("2026-08-20"), TERAZ)).toBe(1);
    expect(dniDo(s("2026-11-01"), TERAZ)).toBe(74);
  });
});

describe("kraj dla locale", () => {
  it("każde z 14 locale aplikacji ma domyślny kraj", () => {
    for (const l of ["pl", "en", "de", "es", "fr", "id", "it", "ja", "ko", "pt", "ru", "uk", "zh", "ar"]) {
      expect(krajDlaLocale(l), `brak kraju dla ${l}`).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("czyta też locale z regionem (`pl-PL`)", () => {
    expect(krajDlaLocale("pl-PL")).toBe("PL");
    expect(krajDlaLocale("DE-at")).toBe("DE");
  });

  // Sedno defektu: portal spoza listy NIE MOŻE po cichu dostać polskiego kalendarza.
  it("nieznane locale daje null, a nie Polskę", () => {
    expect(krajDlaLocale("sv")).toBeNull();
    expect(krajDlaLocale("")).toBeNull();
  });
});

describe("walidacja kodu kraju (trafia do URL-a)", () => {
  it("przyjmuje wyłącznie dwie litery", () => {
    expect(poprawnyKodKraju("PL")).toBe(true);
    expect(poprawnyKodKraju("de")).toBe(true);
  });

  it("odrzuca wszystko, co mogłoby zmienić ścieżkę żądania", () => {
    for (const zle of ["", "P", "POL", "../PL", "PL/x", "P1", null, undefined, 42, "%2e%2e"]) {
      expect(poprawnyKodKraju(zle), `${String(zle)} nie powinno przejść`).toBe(false);
    }
  });

  it("adres składa się z wielkich liter kodu", () => {
    expect(urlSwiat("de")).toBe("https://date.nager.at/api/v3/NextPublicHolidays/DE");
  });
});
