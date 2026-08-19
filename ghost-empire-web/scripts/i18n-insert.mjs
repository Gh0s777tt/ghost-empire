#!/usr/bin/env node
// scripts/i18n-insert.mjs
//
// Chirurgicznie wstawia klucze do WSZYSTKICH katalogów `src/messages/*.json` naraz.
//
// Po co istnieje: CLAUDE.md wprost zaleca ten wzorzec („jednorazowy skrypt … bije 14 ręcznych
// edycji"), bo ręczne dokładanie klucza w czternastu plikach kończy się tym, że w którymś go
// zabraknie — a **brak klucza nie psuje builda**: `src/i18n/request.ts` deep-merge'uje każdy locale
// na EN, więc brakujący klucz po cichu renderuje angielski. Skrypt był dotąd pisany od nowa przy
// każdej migracji tekstów i ginął razem z katalogiem tymczasowym; tutaj zostaje.
//
// Dwie zasady, obie wymuszone przez CLAUDE.md i obie tu istotne:
//  1. **Edytujemy surowy tekst, nigdy `JSON.parse` → `JSON.stringify`.** Round-trip po cichu gubi
//     jeden z pary duplikatów kluczy i przeformatowuje cały plik.
//  2. **Walidacja PRZED zapisem.** Wynik jest parsowany i sprawdzany klucz po kluczu pod właściwą
//     ścieżką; gdy cokolwiek nie wyjdzie, plik zostaje NIETKNIĘTY. Lepiej nie zapisać niż zapisać
//     uszkodzony katalog.
//
// Obsługuje obiekt, który trzeba UTWORZYĆ (`admin.hub`), i taki, który JUŻ ISTNIEJE (`nav`) —
// w drugim przypadku dokłada klucze do istniejącego ciała zamiast tworzyć duplikat nagłówka.
//
// Użycie:
//   node scripts/i18n-insert.mjs <payload.json>
//
// Format payloadu — locale → ścieżka kropkowa → klucze:
//   {
//     "pl": { "admin.hub": { "title": "Hub" }, "nav": { "drops": "Dropy" } },
//     "en": { "admin.hub": { "title": "Hub" }, "nav": { "drops": "Drops" } }
//   }
//
// Wartością może być string ALBO zagnieżdżony obiekt (np. `perm.ban_users.{label,desc}`).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const KORZEN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plikPayloadu = process.argv[2];
if (!plikPayloadu) {
  console.error("Użycie: node scripts/i18n-insert.mjs <payload.json>");
  process.exit(2);
}
const DANE = JSON.parse(readFileSync(resolve(process.cwd(), plikPayloadu), "utf8"));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Zwraca `{ poz, glebokosc }` tuż za `{` ciała obiektu pod ścieżką — albo `null`, gdy go nie ma. */
function znajdzObiekt(s, sciezka) {
  let poz = 0;
  let glebokosc = 1;
  for (const czesc of sciezka.split(".")) {
    const re = new RegExp(`^([ \\t]*)"${escRe(czesc)}"\\s*:\\s*\\{`, "m");
    const m = re.exec(s.slice(poz));
    if (!m) return null;
    glebokosc = Math.floor(m[1].length / 2) + 1;
    poz += m.index + m[0].length;
  }
  return { poz, glebokosc };
}

function wstaw(s, sciezka, obiekt) {
  const W = "  ";
  const wpis = (k, v, gl) =>
    `${W.repeat(gl)}${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split("\n").join(`\n${W.repeat(gl)}`)}`;

  const trafienie = znajdzObiekt(s, sciezka);
  if (trafienie) {
    // Obiekt ISTNIEJE — dokładamy klucze do jego ciała.
    const { poz, glebokosc } = trafienie;
    const ciało = Object.entries(obiekt)
      .map(([k, v]) => `\n${wpis(k, v, glebokosc + 1)},`)
      .join("");
    return s.slice(0, poz) + ciało + s.slice(poz);
  }

  // Nie istnieje — tworzymy jako dziecko rodzica ze ścieżki.
  const czesci = sciezka.split(".");
  const dziecko = czesci.pop();
  let poz, glebokosc;
  if (czesci.length) {
    const rodzic = znajdzObiekt(s, czesci.join("."));
    if (!rodzic) throw new Error(`brak rodzica dla ${sciezka}`);
    ({ poz, glebokosc } = rodzic);
  } else {
    poz = s.indexOf("{") + 1;
    glebokosc = 0;
  }
  const ciało = Object.entries(obiekt)
    .map(([k, v]) => wpis(k, v, glebokosc + 2))
    .join(",\n");
  return (
    s.slice(0, poz) +
    `\n${W.repeat(glebokosc + 1)}${JSON.stringify(dziecko)}: {\n${ciało}\n${W.repeat(glebokosc + 1)}},` +
    s.slice(poz)
  );
}

/** Głębokie porównanie — payload może nieść zagnieżdżone obiekty, nie tylko stringi. */
const rowne = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let ok = 0;
const locales = Object.keys(DANE);
for (const loc of locales) {
  const p = resolve(KORZEN, `src/messages/${loc}.json`);
  let s = readFileSync(p, "utf8");
  try {
    for (const [sciezka, obiekt] of Object.entries(DANE[loc])) s = wstaw(s, sciezka, obiekt);
  } catch (e) {
    console.error(`  ${loc}: ✗ ${e.message} — nie zapisuję`);
    continue;
  }

  let d;
  try {
    d = JSON.parse(s);
  } catch (e) {
    console.error(`  ${loc}: ✗ niepoprawny JSON — nie zapisuję (${e.message})`);
    continue;
  }

  const braki = [];
  for (const [sciezka, obiekt] of Object.entries(DANE[loc])) {
    let w = d;
    for (const c of sciezka.split(".")) w = w && typeof w === "object" ? w[c] : undefined;
    for (const [k, v] of Object.entries(obiekt)) {
      if (!w || !rowne(w[k], v)) braki.push(`${sciezka}.${k}`);
    }
  }
  if (braki.length) {
    console.error(`  ${loc}: ✗ po wstawieniu brakuje ${braki.slice(0, 3).join(", ")} — nie zapisuję`);
    continue;
  }

  writeFileSync(p, s);
  ok++;
}

console.log(`i18n-insert: zapisano ${ok}/${locales.length} katalogów`);
process.exit(ok === locales.length ? 0 : 1);
