import { describe, it, expect } from "vitest";
import {
  capGame, plinkoBucketColor, diceChanceOf, diceMultOf, DICE_EDGE,
  rcolor, pocketLabel, polar, annulus, US_WHEEL, SEG, RED_SET, PLINKO_MULTS_UI,
} from "@/components/kasyno/logic";

describe("kasyno/logic — czysta matematyka gier", () => {
  it("capGame: kapitalizuje pierwszą literę", () => {
    expect(capGame("slots")).toBe("Slots");
    expect(capGame("a")).toBe("A");
    expect(capGame("")).toBe("");
  });

  it("plinkoBucketColor: progi kolorów wg mnożnika", () => {
    expect(plinkoBucketColor(13)).toBe("#c01722");   // >=4 czerwony
    expect(plinkoBucketColor(4)).toBe("#c01722");
    expect(plinkoBucketColor(1.8)).toBe("#b8860b");   // >=1.3 złoty
    expect(plinkoBucketColor(1.3)).toBe("#b8860b");
    expect(plinkoBucketColor(1.05)).toBe("#3f3f46");  // >=1 szary
    expect(plinkoBucketColor(1)).toBe("#3f3f46");
    expect(plinkoBucketColor(0.9)).toBe("#18181b");   // <1 ciemny
    expect(plinkoBucketColor(0.5)).toBe("#18181b");
  });

  it("diceChanceOf: szansa under = t/100, over = (100-t)/100", () => {
    expect(diceChanceOf("under", 50)).toBeCloseTo(0.5);
    expect(diceChanceOf("over", 30)).toBeCloseTo(0.7);
    expect(diceChanceOf("under", 2)).toBeCloseTo(0.02);
    expect(diceChanceOf("over", 98)).toBeCloseTo(0.02);
  });

  it("diceMultOf: (1 - edge) / szansa (house edge wliczony)", () => {
    expect(diceMultOf("under", 50)).toBeCloseTo((1 - DICE_EDGE) / 0.5); // 1.9
    expect(diceMultOf("over", 50)).toBeCloseTo(1.9);
    // im niższa szansa, tym wyższy mnożnik
    expect(diceMultOf("under", 10)).toBeGreaterThan(diceMultOf("under", 50));
  });

  it("rcolor: 0 i 00(37) zielone, RED_SET czerwone, reszta czarne", () => {
    expect(rcolor(0)).toBe("green");
    expect(rcolor(37)).toBe("green");
    expect(rcolor(1)).toBe("red");   // w RED_SET
    expect(rcolor(3)).toBe("red");
    expect(rcolor(2)).toBe("black"); // poza RED_SET
    expect(rcolor(4)).toBe("black");
  });

  it("pocketLabel: 37 → '00', reszta jako liczba", () => {
    expect(pocketLabel(37)).toBe("00");
    expect(pocketLabel(0)).toBe("0");
    expect(pocketLabel(17)).toBe("17");
  });

  it("polar: deg mierzone zgodnie z ruchem wskazówek od góry (12:00)", () => {
    const top = polar(0, 0, 1, 0);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-1); // góra = ujemny y
    const right = polar(0, 0, 1, 90);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
    const bottom = polar(0, 0, 1, 180);
    expect(bottom.x).toBeCloseTo(0);
    expect(bottom.y).toBeCloseTo(1);
  });

  it("annulus: zwraca ścieżkę SVG (M ... A ... L ... A ... Z)", () => {
    const d = annulus(100, 100, 40, 80, 0, 30);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain(" A ");
    expect(d).toContain(" L ");
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("dane ruletki: 38 kieszeni (US double-zero), SEG = 360/38, RED_SET = 18", () => {
    expect(US_WHEEL).toHaveLength(38);
    expect(new Set(US_WHEEL).size).toBe(38); // brak duplikatów
    expect(SEG).toBeCloseTo(360 / 38);
    expect(RED_SET.size).toBe(18);
    expect(PLINKO_MULTS_UI).toHaveLength(13);
  });
});
