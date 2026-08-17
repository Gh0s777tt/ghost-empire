import { describe, it, expect } from "vitest";
import {
  EDITABLE_COPY,
  isEditableCopyKey,
  copyMaxLength,
  walidujCopy,
  resolveCopy,
} from "@/lib/tenant-copy";

describe("EDITABLE_COPY — zamknięta lista", () => {
  it("klucze są unikalne", () => {
    expect(new Set(EDITABLE_COPY.map((e) => e.key)).size).toBe(EDITABLE_COPY.length);
  });
  it("każde pole ma dodatni limit długości", () => {
    for (const e of EDITABLE_COPY) expect(e.max).toBeGreaterThan(0);
  });
  // To jest bezpiecznik, nie kosmetyka: regulamin i polityka prywatności podlegają polskiemu prawu
  // i przeglądowi prawnika (CLAUDE.md), więc portal NIE MOŻE ich nadpisać z panelu.
  it("NIE zawiera kluczy prawnych (terms/privacy)", () => {
    for (const e of EDITABLE_COPY) {
      expect(e.key.startsWith("terms.")).toBe(false);
      expect(e.key.startsWith("privacy.")).toBe(false);
    }
  });
  it("wszystkie klucze mają namespace", () => {
    for (const e of EDITABLE_COPY) expect(e.key).toContain(".");
  });
});

describe("isEditableCopyKey / copyMaxLength", () => {
  it("przepuszcza klucz z listy", () => {
    expect(isEditableCopyKey("welcome.sub2")).toBe(true);
    expect(copyMaxLength("welcome.sub2")).toBeGreaterThan(0);
  });
  it.each(["terms.intro", "privacy.data", "welcome.metaTitle", "cokolwiek", ""])(
    "odrzuca klucz spoza listy: %s",
    (k) => {
      expect(isEditableCopyKey(k)).toBe(false);
      expect(copyMaxLength(k)).toBeNull();
    },
  );
});

describe("walidujCopy", () => {
  it("przyjmuje tekst w granicach i przycina białe znaki", () => {
    expect(walidujCopy("welcome.hlTokens", "  Moje żetony  ")).toEqual({ ok: true, value: "Moje żetony" });
  });
  it("pusty tekst = skasuj nadpisanie (null), a NIE błąd", () => {
    expect(walidujCopy("welcome.hlTokens", "")).toEqual({ ok: true, value: null });
    expect(walidujCopy("welcome.hlTokens", "   ")).toEqual({ ok: true, value: null });
  });
  it("odrzuca klucz spoza listy", () => {
    expect(walidujCopy("terms.intro", "cokolwiek")).toEqual({ ok: false, powod: "nieznany-klucz" });
  });
  it("odrzuca tekst ponad limit", () => {
    const max = copyMaxLength("welcome.hlTokens") as number;
    expect(walidujCopy("welcome.hlTokens", "x".repeat(max + 1))).toEqual({ ok: false, powod: "za-dlugie" });
  });
  it("limit jest inkluzywny — dokładnie `max` przechodzi", () => {
    const max = copyMaxLength("welcome.hlTokens") as number;
    const r = walidujCopy("welcome.hlTokens", "x".repeat(max));
    expect(r.ok).toBe(true);
  });
  it("markery brandingu przechodzą nietknięte (rozwiązywane przy odczycie)", () => {
    expect(walidujCopy("welcome.sub2", "Zbieraj %tokenName% na %brandShort%")).toEqual({
      ok: true,
      value: "Zbieraj %tokenName% na %brandShort%",
    });
  });
});

describe("resolveCopy", () => {
  const fallback = (k: string) => `DOMYŚLNE:${k}`;

  it("nadpisanie portalu wygrywa z tłumaczeniem domyślnym", () => {
    const m = new Map([["welcome.sub2", "Nasz własny opis"]]);
    expect(resolveCopy(m, "welcome.sub2", fallback)).toBe("Nasz własny opis");
  });
  it("brak nadpisania → tłumaczenie domyślne, wołane BEZ namespace'u", () => {
    expect(resolveCopy(new Map(), "welcome.sub2", fallback)).toBe("DOMYŚLNE:sub2");
  });
  // Kluczowe zachowanie: wyczyszczone pole ma pokazać tekst domyślny, a nie dziurę na stronie.
  it("puste nadpisanie NIE zostawia pustki — wraca tłumaczenie domyślne", () => {
    const m = new Map([["welcome.sub2", "   "]]);
    expect(resolveCopy(m, "welcome.sub2", fallback)).toBe("DOMYŚLNE:sub2");
  });
  it("klucz bez namespace'u przechodzi do fallbacku w całości", () => {
    expect(resolveCopy(new Map(), "sub2", fallback)).toBe("DOMYŚLNE:sub2");
  });
  it("nadpisania jednego portalu nie mieszają się z innym kluczem", () => {
    const m = new Map([["welcome.hlTokens", "A"]]);
    expect(resolveCopy(m, "welcome.hlRewards", fallback)).toBe("DOMYŚLNE:hlRewards");
  });
});
