import { describe, it, expect } from "vitest";
import {
  parseHex,
  contrastRatio,
  wcagLevel,
  czytelny,
  fontStack,
  PORTAL_FONTS,
} from "@/lib/brand-palette";

describe("parseHex", () => {
  it("czyta zapis 6-znakowy z hashem i bez", () => {
    expect(parseHex("#E50914")).toEqual({ r: 229, g: 9, b: 20 });
    expect(parseHex("E50914")).toEqual({ r: 229, g: 9, b: 20 });
  });
  it("rozwija skrót 3-znakowy", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#0a0")).toEqual({ r: 0, g: 170, b: 0 });
  });
  it("nie rozróżnia wielkości liter i ignoruje białe znaki", () => {
    expect(parseHex("  #e50914  ")).toEqual(parseHex("#E50914"));
  });
  it.each(["", "#", "#12", "#12345", "#1234567", "#gggggg", "rgb(1,2,3)"])(
    "odrzuca nieprawidłowy zapis %s",
    (zly) => expect(parseHex(zly)).toBeNull(),
  );
});

describe("contrastRatio — wartości referencyjne z WCAG", () => {
  it("czarny na białym to maksimum skali (21:1)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
  it("ten sam kolor to brak kontrastu (1:1)", () => {
    expect(contrastRatio("#E50914", "#E50914")).toBeCloseTo(1, 5);
  });
  it("kolejność argumentów nie ma znaczenia", () => {
    const a = contrastRatio("#123456", "#fedcba");
    const b = contrastRatio("#fedcba", "#123456");
    expect(a).toBeCloseTo(b as number, 10);
  });
  it("nieprawidłowy kolor → null, nie wynik z sufitu", () => {
    expect(contrastRatio("#zzz", "#fff")).toBeNull();
    expect(contrastRatio("#fff", "nie-kolor")).toBeNull();
  });
  // Realny przypadek z zgłoszenia: jasny brand na białym tle wygląda ładnie w próbce
  // koloru, a jako tekst jest nieczytelny.
  it("żółty na białym wypada poniżej progu AA", () => {
    const r = contrastRatio("#ffe600", "#ffffff") as number;
    expect(r).toBeLessThan(4.5);
  });
  it("biały na markowej czerwieni przechodzi AA", () => {
    const r = contrastRatio("#ffffff", "#E50914") as number;
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
});

describe("wcagLevel — progi", () => {
  it.each([
    [21, "AAA"],
    [7, "AAA"],
    [6.9, "AA"],
    [4.5, "AA"],
    [4.4, "AA-duzy"],
    [3, "AA-duzy"],
    [2.9, "slaby"],
    [1, "slaby"],
  ])("tekst zwykły: %s → %s", (ratio, oczekiwany) => {
    expect(wcagLevel(ratio as number)).toBe(oczekiwany);
  });

  it.each([
    [4.5, "AAA"],
    [3, "AA"],
    [2.9, "slaby"],
  ])("tekst duży: %s → %s", (ratio, oczekiwany) => {
    expect(wcagLevel(ratio as number, true)).toBe(oczekiwany);
  });

  it("progi są inkluzywne — dokładnie 4.5 to już AA, nie „prawie”", () => {
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(4.499)).toBe("AA-duzy");
  });
});

describe("czytelny", () => {
  it("czarny tekst na białym tle jest czytelny", () => {
    expect(czytelny("#ffffff", "#000000")).toBe(true);
  });
  it("jasnoszary na białym NIE jest czytelny", () => {
    expect(czytelny("#ffffff", "#cccccc")).toBe(false);
  });
  it("nieprawidłowy kolor traktujemy jako NIEczytelny (fail-closed)", () => {
    expect(czytelny("#ffffff", "nie-kolor")).toBe(false);
  });
});

describe("fontStack — lista zamknięta", () => {
  it("zwraca stos dla znanego identyfikatora", () => {
    expect(fontStack("mono")).toContain("monospace");
  });
  it.each([null, undefined, "", "Comic Sans", "'; background: url(evil)"])(
    "nieznana wartość %s → stos systemowy (wartość z bazy nigdy nie wchodzi do CSS wprost)",
    (zly) => {
      expect(fontStack(zly as string)).toBe(PORTAL_FONTS[0].stack);
    },
  );
  it("identyfikatory są unikalne", () => {
    expect(new Set(PORTAL_FONTS.map((f) => f.id)).size).toBe(PORTAL_FONTS.length);
  });
  it("żaden stos nie zawiera znaków, które mogłyby zamknąć deklarację CSS", () => {
    for (const f of PORTAL_FONTS) expect(f.stack).not.toMatch(/[;{}<>\\]/);
  });
});
