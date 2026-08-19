// Wykrywanie adresów jednorazowych — sygnał anty-multikonto.
//
// Testy pilnują trzech rzeczy naraz: żeby sygnał DZIAŁAŁ bez sieci, żeby nie oskarżał zwykłych
// użytkowników (gmail z setką kont w portalu to norma, nie zmowa), i — najważniejsze — żeby
// **nigdzie nie przeciekła lokalna część adresu**. To ostatnie jest granicą projektu, nie detalem:
// patrzymy na dostawcę poczty, nie na osobę.
import { describe, it, expect } from "vitest";
import {
  domenaZEmaila, czyJednorazowaLokalnie, flagujKonta,
  PROG_KONT_Z_DOMENY, LICZBA_DOMEN_LOKALNYCH, type KontoDoOceny,
} from "@/lib/disposable-email";

const konto = (o: Partial<KontoDoOceny> & { userId: string }): KontoDoOceny => ({
  domena: "gmail.com", kontZDomeny: 1, nieaktywne: false, ...o,
});

describe("domenaZEmaila", () => {
  it("wyciąga domenę małymi literami", () => {
    expect(domenaZEmaila("Ktos@Example.COM")).toBe("example.com");
  });

  it("bierze fragment po OSTATNIM @ (adres z @ w części lokalnej jest poprawny)", () => {
    expect(domenaZEmaila('"a@b"@example.com')).toBe("example.com");
  });

  it("odrzuca to, co nie jest adresem", () => {
    for (const zle of ["", "bez-malpy", "@example.com", "ktos@", "ktos@localhost", "ktos@ex", null, undefined, 42]) {
      expect(domenaZEmaila(zle), `${String(zle)} nie powinno dać domeny`).toBeNull();
    }
  });

  // Sedno noty o prywatności: z adresu wychodzi WYŁĄCZNIE domena.
  it("nie zwraca ani kawałka części lokalnej", () => {
    const d = domenaZEmaila("jan.kowalski.1990@mailinator.com");
    expect(d).toBe("mailinator.com");
    expect(d).not.toContain("jan");
    expect(d).not.toContain("kowalski");
  });
});

describe("lista lokalna (sygnał musi działać bez sieci)", () => {
  it("zna najczęstsze serwisy jednorazowe", () => {
    for (const d of ["mailinator.com", "guerrillamail.com", "yopmail.com", "temp-mail.org"]) {
      expect(czyJednorazowaLokalnie(d), d).toBe(true);
    }
  });

  it("nie oznacza zwykłych dostawców", () => {
    for (const d of ["gmail.com", "outlook.com", "wp.pl", "o2.pl", "proton.me"]) {
      expect(czyJednorazowaLokalnie(d), d).toBe(false);
    }
  });

  it("null (adres nie do sparsowania) nie jest jednorazówką", () => {
    expect(czyJednorazowaLokalnie(null)).toBe(false);
  });

  it("lista nie skurczyła się przypadkiem", () => {
    expect(LICZBA_DOMEN_LOKALNYCH).toBeGreaterThanOrEqual(20);
  });
});

describe("flagujKonta", () => {
  it("flaguje konto z domeny jednorazowej", () => {
    const [f] = flagujKonta([konto({ userId: "u1", domena: "mailinator.com" })]);
    expect(f.userId).toBe("u1");
    expect(f.powody[0]).toContain("jednorazowego");
  });

  // Zwykły użytkownik NIE MOŻE trafić na listę tylko dlatego, że ma gmaila.
  it("nie flaguje zwykłego konta bez żadnego sygnału", () => {
    expect(flagujKonta([konto({ userId: "u1" })])).toEqual([]);
  });

  it("skupisko na jednej domenie flaguje nawet bez listy jednorazówek", () => {
    // Łapie własny serwer pocztowy atakującego — taka domena nie będzie na żadnej publicznej liście.
    const [f] = flagujKonta([konto({ userId: "u1", domena: "moj-serwer.tld", kontZDomeny: PROG_KONT_Z_DOMENY })]);
    expect(f.powody.some((p) => p.includes("tej samej domeny"))).toBe(true);
  });

  it("skupisko poniżej progu nie wystarcza", () => {
    expect(flagujKonta([konto({ userId: "u1", domena: "x.tld", kontZDomeny: PROG_KONT_Z_DOMENY - 1 })])).toEqual([]);
  });

  it("domena z Disify liczy się tak samo jak z listy lokalnej", () => {
    const bez = flagujKonta([konto({ userId: "u1", domena: "nowa-jednorazowka.tld" })]);
    const z = flagujKonta([konto({ userId: "u1", domena: "nowa-jednorazowka.tld" })], new Set(["nowa-jednorazowka.tld"]));
    expect(bez).toEqual([]);
    expect(z).toHaveLength(1);
  });

  it("waga rośnie z liczbą sygnałów i sortuje listę", () => {
    const f = flagujKonta([
      konto({ userId: "slaby", domena: "duzy.tld", kontZDomeny: PROG_KONT_Z_DOMENY }),
      konto({ userId: "mocny", domena: "mailinator.com", kontZDomeny: PROG_KONT_Z_DOMENY, nieaktywne: true }),
    ]);
    expect(f.map((x) => x.userId)).toEqual(["mocny", "slaby"]);
    expect(f[0].waga).toBeGreaterThan(f[1].waga);
  });

  it("konto bez rozpoznanej domeny jest pomijane, nie flagowane", () => {
    expect(flagujKonta([konto({ userId: "u1", domena: null, kontZDomeny: 99 })])).toEqual([]);
  });

  it("flaga niesie domenę, a nigdy adresu", () => {
    const [f] = flagujKonta([konto({ userId: "u1", domena: "mailinator.com" })]);
    expect(f.domena).toBe("mailinator.com");
    expect(JSON.stringify(f)).not.toContain("@");
  });
});
