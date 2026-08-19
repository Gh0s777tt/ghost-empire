// Strażnik uprawnień, które niczego nie strzegą.
//
// Tło: `mute_users` siedziało w `MOD_PERMISSIONS` od dawna — panel wymieniał je jak każde inne,
// właściciel portalu mógł je nadać moderatorowi, a **żaden kod go nie sprawdzał**. Kolumna, którą
// miało rządzić (`Connection.isMuted`), ma zero czytelników (ROADMAP §0b D10). Efekt: panel
// obiecywał funkcję, której produkt nie ma, i nic tego nie widziało — `tsc` jest zadowolony
// (to poprawny string), testy też, bo nie było czego testować.
//
// Ten test pilnuje spójności w OBIE strony:
//  · uprawnienie sprawdzane w kodzie NIE MOŻE być oznaczone jako uśpione (byłoby kłamstwem w UI),
//  · uprawnienie niesprawdzane nigdzie MUSI być uśpione (inaczej znowu obiecujemy nieistniejące).
//
// Dzięki temu dołożenie uprawnienia „na zapas" wymusza świadomą decyzję, a podłączenie uśpionego
// do realnej trasy wymusza zdjęcie flagi — zamiast zostawić w panelu nieaktualną plakietkę.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MOD_PERMISSIONS, USPIONE_UPRAWNIENIA } from "@/lib/permissions";

const KORZEN = join(process.cwd(), "src");

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

/**
 * Treść całego `src/` BEZ definicji uprawnień i bez komentarzy.
 *
 * @remarks
 * `permissions.ts` wypada z puli celowo — inaczej każde uprawnienie „widziałoby siebie" we własnej
 * definicji i test nie wykryłby niczego. Komentarze wypadają, bo opisują ten mechanizm, wymieniając
 * uprawnienia z nazwy.
 */
const KOD = pliki(KORZEN)
  .filter((p) => !p.endsWith(join("lib", "permissions.ts")))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** Czy id pojawia się jako literał w kodzie (`requirePermission("x")`, mapa sekcji → uprawnienie…). */
const uzywane = (id: string) => KOD.includes(`"${id}"`) || KOD.includes(`'${id}'`);

describe("uprawnienia moderatorów — żadne nie obiecuje nieistniejącej funkcji", () => {
  it("skan objął realny kod (inaczej test jest pusty)", () => {
    expect(KOD.length).toBeGreaterThan(100_000);
    expect(MOD_PERMISSIONS.length).toBeGreaterThan(10);
  });

  it("uprawnienie sprawdzane w kodzie NIE jest oznaczone jako uśpione", () => {
    const klamstwa = MOD_PERMISSIONS.filter((p) => USPIONE_UPRAWNIENIA.has(p.id) && uzywane(p.id)).map((p) => p.id);
    expect(
      klamstwa,
      `Te uprawnienia są realnie sprawdzane, więc plakietka „nieaktywne" w panelu kłamie — zdejmij ` +
        `\`dormant: true\`: ${klamstwa.join(", ")}`,
    ).toEqual([]);
  });

  it("uprawnienie niesprawdzane nigdzie JEST oznaczone jako uśpione", () => {
    const ciche = MOD_PERMISSIONS.filter((p) => !USPIONE_UPRAWNIENIA.has(p.id) && !uzywane(p.id)).map((p) => p.id);
    expect(
      ciche,
      `Te uprawnienia można nadać, ale żaden kod ich nie sprawdza — panel obiecuje funkcję, której ` +
        `nie ma: ${ciche.join(", ")}. Podłącz je do trasy albo oznacz \`dormant: true\` z powodem.`,
    ).toEqual([]);
  });

  it("`mute_users` zostaje uśpione dopóki wyciszanie nie jest uzgodnione z botem czatu", () => {
    // Wymienione z nazwy, bo to konkretny dług z ROADMAP §0b D10: ożywienie bez uzgodnienia
    // z `ghost-empire-chat/src/moderation.ts` da dwa niezależne stany wyciszenia.
    expect(USPIONE_UPRAWNIENIA.has("mute_users")).toBe(true);
  });

  it("każde uśpione id nadal istnieje w katalogu uprawnień (nie osierocamy wpisów w modPermissions)", () => {
    const znane = new Set(MOD_PERMISSIONS.map((p) => p.id as string));
    expect([...USPIONE_UPRAWNIENIA].filter((id) => !znane.has(id))).toEqual([]);
  });
});
