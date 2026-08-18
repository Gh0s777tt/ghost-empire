// Strażnik wbudowanych słowników PL/EN w kodzie — luka, której `docs:i18n` z definicji nie widzi.
//
// Tło: część powierzchni trzymała teksty w `const T = { pl: {…}, en: {…} }` albo we wtrąceniach
// `isPl ? "…" : "…"` wprost w komponencie. Skutek: **12 z 14 języków dostaje angielski**, a bramka
// `docs:i18n` melduje zieleń — bo porównuje katalogi między sobą, a tych kluczy w żadnym katalogu
// nie ma. Dryf był więc nie tylko niewidoczny, ale wręcz *potwierdzany* jako brak problemu.
//
// Test blokuje NOWE wystąpienia i trzyma znane w jawnym rejestrze. `DOPUSZCZONE` to **dług**, nie
// wyjątek: pozycje znikają z listy w miarę przenoszenia tekstów do `messages/*.json` (ROADMAP §0b
// D7). Dopisanie tu czegoś nowego powinno być świadomą decyzją opisaną w PR, a nie odruchem.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const KORZEN = join(process.cwd(), "src");

/**
 * Pliki, w których wbudowany słownik jeszcze siedzi — z powodem, dlaczego nie padł w tej rundzie.
 *
 * @remarks
 * **Rejestr jest PUSTY i to jest stan docelowy** — D7 (ROADMAP §0b) domknięte w całości: najpierw
 * powierzchnie widza, potem pięć sekcji panelu. Pusty rejestr znaczy, że każdy tekst w produkcie
 * idzie z `messages/*.json`, czyli ze wszystkich 14 języków, a nie z dwóch wpisanych w komponent.
 *
 * Dopisanie tu czegokolwiek to **zaciągnięcie długu**, nie wyjątek: pozycja musi nieść powód i być
 * opisana w PR. Test niżej pilnuje obu kierunków — nie wpuszcza nowych plików i nie pozwala trzymać
 * w rejestrze pozycji już spłaconych.
 */
const DOPUSZCZONE: Readonly<Record<string, string>> = {};

/** `const T = {` z zagnieżdżonym `pl:` — słownik dwujęzyczny trzymany w kodzie. */
const SLOWNIK = /const\s+T\s*=\s*\{[\s\S]{0,400}?\bpl\s*:/;
/** `isPl ? "…" : "…"` — ta sama choroba, tylko rozsypana po JSX-ie. */
const WTRACENIE = /\bisPl\s*\?[\s\S]{0,80}?["'`]/;

function pliki(katalog: string): string[] {
  const wynik: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    const pelna = join(katalog, wpis);
    if (statSync(pelna).isDirectory()) {
      if (wpis === "__tests__" || wpis === "node_modules") continue;
      wynik.push(...pliki(pelna));
    } else if (/\.tsx?$/.test(wpis)) {
      wynik.push(pelna);
    }
  }
  return wynik;
}

/** Komentarze wycinamy: nagłówki plików opisują ten wzorzec, opisując jego USUNIĘCIE. */
function bezKomentarzy(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const ZNALEZIONE = pliki(KORZEN)
  .map((p) => ({ sciezka: relative(KORZEN, p).split(sep).join("/"), tresc: bezKomentarzy(readFileSync(p, "utf8")) }))
  .filter(({ tresc }) => SLOWNIK.test(tresc) || WTRACENIE.test(tresc))
  .map(({ sciezka }) => sciezka);

describe("wbudowane słowniki PL/EN — luka niewidoczna dla docs:i18n", () => {
  it("skan faktycznie przeszedł po drzewie (inaczej test jest pusty)", () => {
    expect(pliki(KORZEN).length).toBeGreaterThan(300);
  });

  it("żaden NOWY plik nie trzyma tekstów w kodzie zamiast w messages/*.json", () => {
    const nowe = ZNALEZIONE.filter((p) => !(p in DOPUSZCZONE));
    expect(
      nowe,
      `Teksty w kodzie zamiast w katalogu — 12 z 14 języków dostanie angielski, a docs:i18n tego ` +
        `NIE wykryje: ${nowe.join(", ")}. Przenieś je do src/messages/*.json (wszystkie 14 locale) ` +
        `albo — jeśli to świadoma decyzja — dopisz do DOPUSZCZONE z powodem i opisz ją w PR.`,
    ).toEqual([]);
  });

  it("rejestr długu nie zawiera pozycji już spłaconych", () => {
    const spłacone = Object.keys(DOPUSZCZONE).filter((p) => !ZNALEZIONE.includes(p));
    expect(
      spłacone,
      `Te pliki nie mają już wbudowanego słownika — usuń je z DOPUSZCZONE: ${spłacone.join(", ")}`,
    ).toEqual([]);
  });

  it("każda pozycja długu niesie powód", () => {
    expect(Object.entries(DOPUSZCZONE).filter(([, p]) => p.trim().length < 10).map(([p]) => p)).toEqual([]);
  });

  // Powierzchnie WIDOCZNE DLA WIDZA wymienione z nazwy: to one były sednem defektu i one nie mogą
  // wrócić na wbudowany słownik nawet przez dopisanie do rejestru.
  it("powierzchnie widza są czyste i nie da się ich wpisać do rejestru", () => {
    for (const p of ["components/profile/DonationClaimCard.tsx", "app/[locale]/rozszerzenia/page.tsx"]) {
      expect(ZNALEZIONE, `${p} nie może trzymać tekstów w kodzie`).not.toContain(p);
      expect(Object.keys(DOPUSZCZONE), `${p} nie może być w rejestrze długu`).not.toContain(p);
    }
  });
});
