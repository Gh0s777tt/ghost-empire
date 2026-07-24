// src/lib/__tests__/i18n-duplicate-scan.test.ts
// Testy parsera z `scripts/check-i18n-duplicates.mjs` — bramki, która pilnuje, żeby
// w katalogach tłumaczeń nie było zduplikowanych kluczy (JSON.parse zachowuje tylko
// OSTATNI, więc wcześniejszy jest martwy i ginie przy pierwszym parse→stringify).
//
// Dlaczego to w ogóle testujemy: strażnik, który po cichu przestanie wykrywać
// duplikaty, świeci na ZIELONO nic nie sprawdzając — czyli jest gorszy niż jego brak.
// Parser jest pisany ręcznie (JSON.parse z definicji nie potrafi tego wykryć), więc
// to jedyne miejsce z realną logiką do zepsucia.
import { describe, it, expect } from "vitest";
// Bramka to zwykły `.mjs` poza `src/` — typy TS bierze z JSDoc-a w skrypcie (allowJs).
import { findDuplicateKeys } from "../../../scripts/check-i18n-duplicates.mjs";

type Dup = {
  path: string;
  key: string;
  firstLine: number;
  lastLine: number;
  firstValue: string;
  lastValue: string;
};
const scan = (text: string): Dup[] => findDuplicateKeys(text, "test.json") as Dup[];

describe("findDuplicateKeys", () => {
  it("wykrywa duplikat i wskazuje, która wartość jest martwa, a która renderowana", () => {
    const dups = scan('{\n  "a": "dead",\n  "b": 1,\n  "a": "wins"\n}');
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({
      path: "a",
      key: "a",
      firstLine: 2,
      lastLine: 4,
      firstValue: '"dead"',
      lastValue: '"wins"',
    });
  });

  it("odtwarza realny przypadek admin.tntCreated (zagnieżdżona ścieżka)", () => {
    const dups = scan(
      '{\n  "admin": {\n    "tntCreated": "Utworzony",\n    "tntCreateBtn": "Załóż portal",\n    "tntCreated": "Portal {slug} utworzony"\n  }\n}',
    );
    expect(dups).toHaveLength(1);
    expect(dups[0].path).toBe("admin.tntCreated");
    expect(dups[0].firstValue).toBe('"Utworzony"');
    expect(dups[0].lastValue).toBe('"Portal {slug} utworzony"');
  });

  it("nie zgłasza nic dla czystego katalogu", () => {
    expect(scan('{"a": {"x": 1, "y": 2}, "b": {"x": 3}}')).toEqual([]);
  });

  it("ten sam klucz w RÓŻNYCH obiektach to nie duplikat", () => {
    // Klasyczny fałszywy alarm: "title" żyje w wielu namespace'ach i to jest OK.
    expect(scan('{"home": {"title": "A"}, "about": {"title": "B"}}')).toEqual([]);
  });

  it("nie gubi się na nawiasach/przecinkach WEWNĄTRZ wartości tekstowych", () => {
    // Placeholdery ICU i escapowane cudzysłowy nie mogą rozjechać skanera.
    const dups = scan('{"k": "a {\\"b\\": 1}, c", "k": "second"}');
    expect(dups).toHaveLength(1);
    expect(dups[0].firstValue).toBe('"a {\\"b\\": 1}, c"');
  });

  it("przechodzi przez tablice i widzi duplikaty w obiektach w środku", () => {
    const dups = scan('{"list": [{"a": 1, "a": 2}, {"b": 3}]}');
    expect(dups).toHaveLength(1);
    expect(dups[0].path).toBe("list[0].a");
  });

  it("porównuje klucze po ODKODOWANIU escape'ów", () => {
    // "a" i "a" to ten sam klucz dla JSON.parse — więc też duplikat.
    expect(scan('{"a": 1, "\\u0061": 2}')).toHaveLength(1);
  });

  it("potrójny duplikat raportuje parami, więc nic nie ginie", () => {
    const dups = scan('{"a": 1, "a": 2, "a": 3}');
    expect(dups).toHaveLength(2);
    expect(dups.map((d) => [d.firstValue, d.lastValue])).toEqual([
      ["1", "2"],
      ["2", "3"],
    ]);
  });

  it("radzi sobie z literałami innymi niż string oraz pustymi kontenerami", () => {
    expect(scan('{"a": null, "b": true, "c": -1.5e3, "d": {}, "e": [], "a": false}')).toHaveLength(1);
  });

  it("rzuca czytelny błąd na niepoprawnym JSON-ie (zamiast cicho przepuścić)", () => {
    expect(() => scan('{"a": 1,}')).toThrow(/test\.json:1/);
    expect(() => scan('{"a": "niedomknięty')).toThrow(/niedomknięty literał/);
  });
});
