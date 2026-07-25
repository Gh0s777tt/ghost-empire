// scripts/check-i18n-duplicates.mjs
// Strażnik dryfu katalogów tłumaczeń: wykrywa ZDUPLIKOWANE KLUCZE w tym samym obiekcie
// w `src/messages/<locale>.json`. Duplikat jest niewidoczny gołym okiem i groźny:
// `JSON.parse` (a więc next-intl, edytory, każdy skrypt robiący parse→stringify)
// zachowuje TYLKO OSTATNIE wystąpienie — wcześniejsza wartość jest martwym kodem,
// a pierwszy lepszy round-trip po cichu ją kasuje. Efekt: ktoś „poprawia" tekst,
// który nigdy nie trafia na ekran, albo traci tłumaczenie przy zapisie pliku.
//
// Dlatego parsujemy TEKST SUROWY własnym parserem (rekurencyjny zjazd po znakach),
// zamiast `JSON.parse` — parse z definicji scala duplikaty, więc nie da się ich nim
// wykryć. Parser jest tylko do odczytu: nie przepisuje plików.
//
//   npm run docs:i18n     (część lokalnych bramek + verify-all.sh)
//
// Wyjście: 0 = czysto, 1 = znaleziono duplikaty (wypisane z plikiem, ścieżką klucza,
// numerami linii i OBIEMA wartościami — tą martwą i tą, którą faktycznie widzi user),
// 2 = plik nie jest poprawnym JSON-em (błąd parsera).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(webRoot, "src", "messages");

/** Skrót długiej wartości do jednej linijki, żeby raport dało się czytać. */
const preview = (raw, max = 90) => {
  const flat = raw.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
};

/**
 * Mapuje offset znakowy → numer linii (1-indeksowany).
 * Budujemy tablicę początków linii raz na plik i szukamy binarnie — pliki mają
 * ~5 tys. linii i tysiące kluczy, więc liniowe skanowanie byłoby O(n²).
 */
function makeLineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * Ręczny parser JSON, który zamiast budować obiekt — raportuje duplikaty kluczy.
 *
 * Eksportowany, bo to jedyny nietrywialny kawałek logiki w tym strażniku: gdyby
 * po cichu przestał działać, bramka świeciłaby na zielono nic nie sprawdzając.
 * Testy: `src/lib/__tests__/i18n-duplicate-scan.test.ts`.
 *
 * @param text  surowa treść pliku JSON
 * @param file  nazwa pliku (tylko do komunikatów błędów)
 * @returns lista duplikatów; `firstValue` to wartość MARTWA, `lastValue` renderowana
 * @throws {Error} gdy tekst nie jest poprawnym JSON-em
 * @example
 * findDuplicateKeys('{"a":1,"a":2}', "x.json")
 * // → [{ path: "a", key: "a", firstLine: 1, lastLine: 1, firstValue: "1", lastValue: "2" }]
 */
export function findDuplicateKeys(text, file) {
  const lineOf = makeLineIndex(text);
  const dups = [];
  let i = 0;

  const fail = (msg) => {
    throw new Error(`${file}:${lineOf(i)} — ${msg}`);
  };

  // JSON-owe białe znaki: spacja, tab, LF, CR. Komentarze nie istnieją w JSON.
  const skipWs = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };

  // Zwraca [odkodowaną wartość, offset końca]. Odkodowujemy przez JSON.parse na
  // POJEDYNCZYM literale — to nie jest round-trip obiektu, więc duplikatów nie ruszy,
  // a daje poprawne porównanie kluczy zapisanych różnie (np. "a" vs "a").
  const parseString = () => {
    if (text[i] !== '"') fail(`oczekiwano '"', jest '${text[i]}'`);
    const start = i;
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") i += 2;
      else if (c === '"') {
        i++;
        return JSON.parse(text.slice(start, i));
      } else i++;
    }
    fail("niedomknięty literał tekstowy");
  };

  const parseValue = (path) => {
    skipWs();
    const c = text[i];
    if (c === "{") return parseObject(path);
    if (c === "[") return parseArray(path);
    if (c === '"') return void parseString();
    // literał: liczba / true / false / null — jedziemy do najbliższego separatora
    const start = i;
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    if (i === start) fail(`nieoczekiwany znak '${c}'`);
  };

  const parseArray = (path) => {
    i++; // '['
    let idx = 0;
    // Do góry pętli wracamy TYLKO po przecinku (albo na starcie), więc ']' tutaj
    // przy idx > 0 znaczy trailing comma — JSON tego zabrania i nie udajemy, że nie.
    for (;;) {
      skipWs();
      if (text[i] === "]") {
        if (idx > 0) fail("przecinek na końcu tablicy (trailing comma)");
        return void i++;
      }
      parseValue(`${path}[${idx++}]`);
      skipWs();
      if (text[i] === ",") i++;
      else if (text[i] === "]") return void i++;
      else fail(`oczekiwano ',' lub ']', jest '${text[i]}'`);
    }
  };

  const parseObject = (path) => {
    i++; // '{'
    // key → ostatnie widziane wystąpienie; trzymamy ostatnie, więc potrójny duplikat
    // raportuje się parami (1↔2, 2↔3) i nic nie ginie.
    const seen = new Map();
    // Jak w parseArray: '}' na górze pętli po pierwszej parze = trailing comma.
    for (;;) {
      skipWs();
      if (text[i] === "}") {
        if (seen.size > 0) fail("przecinek na końcu obiektu (trailing comma)");
        return void i++;
      }
      const keyStart = i;
      const key = parseString();
      const keyLine = lineOf(keyStart);
      skipWs();
      if (text[i] !== ":") fail(`oczekiwano ':' po kluczu "${key}"`);
      i++;
      skipWs();
      const valueStart = i;
      const childPath = path ? `${path}.${key}` : key;
      parseValue(childPath);
      const raw = text.slice(valueStart, i);

      const prev = seen.get(key);
      if (prev) {
        dups.push({
          path: childPath,
          key,
          firstLine: prev.line,
          lastLine: keyLine,
          firstValue: preview(prev.raw),
          lastValue: preview(raw),
        });
      }
      seen.set(key, { line: keyLine, raw });

      skipWs();
      if (text[i] === ",") i++;
      else if (text[i] === "}") return void i++;
      else fail(`oczekiwano ',' lub '}' po kluczu "${key}", jest '${text[i]}'`);
    }
  };

  skipWs();
  parseValue("");
  skipWs();
  if (i !== text.length) fail("śmieci po głównej wartości JSON");
  return dups;
}

// ---- runner ---------------------------------------------------------------
// Tylko gdy plik odpalono bezpośrednio (`node scripts/check-i18n-duplicates.mjs`).
// Import z testów nie może wywołać `process.exit`.
function main() {
  const files = readdirSync(messagesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(`\n❌ Brak katalogów tłumaczeń w ${messagesDir}.\n`);
    process.exit(2);
  }

  let total = 0;
  for (const file of files) {
    let dups;
    try {
      dups = findDuplicateKeys(readFileSync(join(messagesDir, file), "utf8"), basename(file));
    } catch (e) {
      console.error(`\n❌ Nie udało się sparsować ${file}: ${e.message}\n`);
      process.exit(2);
    }
    if (!dups.length) continue;
    if (total === 0) console.error(`\n❌ Zduplikowane klucze w katalogach tłumaczeń.`);
    console.error(`\n  ${file} — ${dups.length} duplikat(ów):`);
    for (const d of dups) {
      console.error(`    ${d.path}`);
      console.error(`      linia ${d.firstLine} (MARTWA, nadpisana): ${d.firstValue}`);
      console.error(`      linia ${d.lastLine} (renderowana):        ${d.lastValue}`);
    }
    total += dups.length;
  }

  if (total) {
    console.error(`\n  JSON.parse zachowuje OSTATNIE wystąpienie — wcześniejsze są martwe i zniknęłyby`);
    console.error(`  przy pierwszym zapisie pliku przez narzędzie robiące parse→stringify.`);
    console.error(`  Usuń martwy wpis (albo przenieś jego treść do tego, który wygrywa)`);
    console.error(`  edytując plik TEKSTOWO, i uruchom \`npm run docs:i18n\` ponownie.\n`);
    process.exit(1);
  }

  console.log(
    `✅ i18n bez duplikatów — ${files.length} katalog(ów) tłumaczeń, zero zduplikowanych kluczy.`
  );
}

// `import.meta.main` jest dopiero od Node 24, a CI stoi na node:22 — porównujemy argv.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
