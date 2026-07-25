// Strażnik powierzchni: odpowiedzi bota są wklejane na czat WERBATIM — nie przechodzą ani
// przez `jsonError`, ani przez `/api/notifications`, ani przez katalogi i18n, więc **nic**
// nie rozwiąże w nich markerów `%gt%`/`%tokenName%`. Poprzednie sweepy white-label podmieniały
// literał "GT" na marker mechanicznie w całym `src/` — tutaj taka podmianka wypisałaby widzom
// dosłowne „%gt%" na czacie. Drugi kierunek: literalna marka założyciela w cudzym czacie.
//
// Ten test czyta ŹRÓDŁA (a nie wywołuje tras) — celowo: pilnuje konwencji pisania kodu,
// a nie zachowania jednej ścieżki. Konwencja: waluta kasyna = uniwersalne „żetony 🪙"
// (CHIP_SYMBOL), marka portalu = `getCurrentTenant()`, nigdy literał.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BOT_DIR = path.join(process.cwd(), "src/app/api/bot");

/** Wszystkie źródła tras bota (bez testów). */
function botSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...botSources(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Linie kodu (bez komentarzy) — komentarz o markerach jest w porządku, użycie nie. */
function codeLines(file: string): { line: number; text: string }[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
}

describe("odpowiedzi bota na czacie — bez markerów i bez marki założyciela", () => {
  const files = botSources(BOT_DIR);

  it("w ogóle znajduje trasy bota (inaczej test cicho nic nie sprawdza)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("nie zawierają markerów brandingu — na czacie nie ma ich kto rozwiązać", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { line, text } of codeLines(file)) {
        if (/%(tokenName|gt|brandName|brandShort|owner)%/.test(text)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${line}: ${text.trim()}`);
        }
      }
    }
    expect(offenders, `marker trafiłby na czat dosłownie:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("nie zawierają wpisanej na sztywno marki założyciela", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { line, text } of codeLines(file)) {
        if (/Ghost Empire|Ghost Tokens|gh0s77tt/i.test(text)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${line}: ${text.trim()}`);
        }
      }
    }
    expect(offenders, `marka założyciela w czacie obcego portalu:\n${offenders.join("\n")}`).toEqual([]);
  });
});
