import { describe, it, expect } from "vitest";
import { SCENE_WIDGETS, sceneWidget, clampElement, parseElements, MAX_ELEMENTS } from "@/lib/overlay-scenes";

describe("catalog", () => {
  it("has unique ids and valid overlay paths", () => {
    expect(new Set(SCENE_WIDGETS.map((w) => w.id)).size).toBe(SCENE_WIDGETS.length);
    for (const w of SCENE_WIDGETS) expect(w.path.startsWith("/overlay")).toBe(true);
  });
  it("sceneWidget looks up by id", () => {
    expect(sceneWidget("goals")?.path).toBe("/overlay/goals");
    expect(sceneWidget("nope")).toBeNull();
  });
});

describe("clampElement", () => {
  it("clamps size to 4..100 and keeps the element on-canvas", () => {
    const el = clampElement({ id: "a", widget: "goals", x: 95, y: 98, w: 40, h: 30 });
    expect(el.w).toBe(40);
    expect(el.x).toBe(60); // 100 - 40
    expect(el.y).toBe(70); // 100 - 30
  });
  it("clamps tiny/huge sizes", () => {
    expect(clampElement({ id: "a", widget: "goals", x: 0, y: 0, w: 1, h: 999 }).w).toBe(4);
    expect(clampElement({ id: "a", widget: "goals", x: 0, y: 0, w: 1, h: 999 }).h).toBe(100);
  });
  it("clamps negative position to 0", () => {
    const el = clampElement({ id: "a", widget: "goals", x: -50, y: -10, w: 20, h: 20 });
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
  });
});

describe("parseElements", () => {
  it("returns [] for empty / bad JSON / non-array", () => {
    expect(parseElements(null)).toEqual([]);
    expect(parseElements("")).toEqual([]);
    expect(parseElements("{bad")).toEqual([]);
    expect(parseElements('{"x":1}')).toEqual([]);
  });
  it("drops unknown widgets and keeps valid ones (clamped)", () => {
    const json = JSON.stringify([
      { id: "1", widget: "goals", x: 10, y: 10, w: 26, h: 37 },
      { id: "2", widget: "totally-fake", x: 0, y: 0, w: 10, h: 10 },
      { id: "3", widget: "viewers", x: 200, y: 0, w: 11, h: 7 },
    ]);
    const out = parseElements(json);
    expect(out.map((e) => e.widget)).toEqual(["goals", "viewers"]);
    expect(out[1].x).toBe(89); // 100 - 11, clamped on-canvas
  });
  it("defaults missing size from the catalog", () => {
    const out = parseElements(JSON.stringify([{ widget: "goals", x: 0, y: 0 }]));
    expect(out[0].w).toBe(26);
    expect(out[0].h).toBe(37);
  });
  it("caps the element count", () => {
    const many = Array.from({ length: 50 }, () => ({ widget: "viewers", x: 0, y: 0, w: 11, h: 7 }));
    expect(parseElements(JSON.stringify(many)).length).toBe(MAX_ELEMENTS);
  });
});
