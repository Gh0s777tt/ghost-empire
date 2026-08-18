#!/usr/bin/env node
// scripts/check-changelog-sections.mjs
//
// Bramka `docs:changelog`: w sekcji `## [Unreleased]` CHANGELOG-a każdy nagłówek `###` ma
// wystąpić DOKŁADNIE RAZ.
//
// Po co istnieje: każdy MR dopisuje swój wpis własnym `### Fixed` / `### Changed` zamiast dopisać
// do istniejącego, a git scala to bezkonfliktowo — więc nic o tym nie mówi. Narastało po cichu do
// **78 bloków** przy dziewięciu typach (17× „Changed", 18× „Fixed"), i `grep "### Fixed"` zwracał
// osiemnaście trafień zamiast jednego. Czytelnik nie miał jak znaleźć wszystkich zmian danego typu.
//
// Bramka NIE przepisuje pliku — mówi, co scalić, i podaje gotową komendę. Świadomie: CHANGELOG
// czyta człowiek, więc kolejność wpisów w scalonej sekcji ma być decyzją człowieka, nie skryptu.
//
// Uruchamiane też z `verify-all.sh` i z joba `lint:web` w CI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const KORZEN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLIK = resolve(KORZEN, "CHANGELOG.md");

let tekst;
try {
  tekst = readFileSync(PLIK, "utf8");
} catch {
  console.log("⚠️  docs:changelog — brak CHANGELOG.md, pomijam.");
  process.exit(0);
}

const start = tekst.indexOf("## [Unreleased]");
if (start < 0) {
  console.log("⚠️  docs:changelog — brak sekcji `## [Unreleased]`, pomijam.");
  process.exit(0);
}
// Koniec sekcji = następny nagłówek wersji `## [`, albo koniec pliku.
const poStarcie = tekst.slice(start + "## [Unreleased]".length);
const dalszy = poStarcie.search(/\n## \[/);
const sekcja = dalszy < 0 ? poStarcie : poStarcie.slice(0, dalszy);

const liczba = new Map();
for (const linia of sekcja.split("\n")) {
  if (!linia.startsWith("### ")) continue;
  const nazwa = linia.slice(4).trim();
  liczba.set(nazwa, (liczba.get(nazwa) ?? 0) + 1);
}

const zduplikowane = [...liczba.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
const wpisow = sekcja.split("\n").filter((l) => l.startsWith("- **")).length;

if (zduplikowane.length === 0) {
  console.log(
    `✅ CHANGELOG w porządku — [Unreleased]: ${liczba.size} sekcji, zero powtórzonych nagłówków (${wpisow} wpisów).`,
  );
  process.exit(0);
}

console.error("❌ CHANGELOG: powtórzone nagłówki `###` w sekcji [Unreleased].");
for (const [nazwa, n] of zduplikowane) console.error(`   ${n}× "### ${nazwa}"`);
console.error(
  "\n   Scal każdy typ w JEDEN blok (kolejność wpisów wewnątrz typu zostaw bez zmian —\n" +
    "   CHANGELOG czyta człowiek). Dopisując nowy wpis, dokładaj go do ISTNIEJĄCEGO\n" +
    "   nagłówka danego typu, zamiast zaczynać kolejny.",
);
process.exit(1);
