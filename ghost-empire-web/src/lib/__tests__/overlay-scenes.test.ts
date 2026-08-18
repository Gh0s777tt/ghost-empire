import { describe, it, expect } from "vitest";
import { SCENE_WIDGETS, sceneWidget, clampElement, parseElements, elementEnabled, moveElement, MAX_ELEMENTS } from "@/lib/overlay-scenes";

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

describe("parseElements — media elements (image/video)", () => {
  it("keeps an image element with a safe http(s) src (default 30×30)", () => {
    const out = parseElements(JSON.stringify([{ id: "i", widget: "image", src: "https://cdn.example.com/a.png", x: 10, y: 10 }]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ widget: "image", src: "https://cdn.example.com/a.png", w: 30, h: 30 });
  });
  it("keeps a VIDEO element with a safe http(s) src (default 40×23, ~16:9)", () => {
    const out = parseElements(JSON.stringify([{ id: "v", widget: "video", src: "https://cdn.example.com/clip.mp4", x: 5, y: 5 }]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ widget: "video", src: "https://cdn.example.com/clip.mp4", w: 40, h: 23 });
  });
  it("drops a media element whose src is unsafe (javascript:) or missing — no empty <img>/<video>", () => {
    expect(parseElements(JSON.stringify([{ widget: "video", src: "javascript:alert(1)", x: 0, y: 0 }]))).toEqual([]);
    expect(parseElements(JSON.stringify([{ widget: "image", x: 0, y: 0 }]))).toEqual([]);
  });
});

// Włącz/wyłącz element (update 2026-08). Kluczowa zasada: brak pola `enabled` = WŁĄCZONY, bo
// wszystkie sceny zapisane przed tą zmianą go nie mają i muszą renderować się dalej.
describe("element enabled flag", () => {
  it("brak pola = włączony (zgodność wsteczna ze scenami sprzed zmiany)", () => {
    const [el] = parseElements('[{"id":"a","widget":"goals","x":0,"y":0,"w":20,"h":20}]');
    expect(elementEnabled(el)).toBe(true);
    expect(el.enabled).toBeUndefined(); // nie dopisujemy domyślnej wartości do JSON
  });
  it("enabled:false przetrwa round-trip przez parseElements", () => {
    const [el] = parseElements('[{"id":"a","widget":"goals","x":0,"y":0,"w":20,"h":20,"enabled":false}]');
    expect(el.enabled).toBe(false);
    expect(elementEnabled(el)).toBe(false);
  });
  it("enabled:true nie jest zapisywane (stan domyślny nie zaśmieca JSON-a)", () => {
    const [el] = parseElements('[{"id":"a","widget":"goals","x":0,"y":0,"w":20,"h":20,"enabled":true}]');
    expect(el.enabled).toBeUndefined();
    expect(elementEnabled(el)).toBe(true);
  });
  it("działa tak samo dla elementów mediów", () => {
    const json = '[{"id":"i","widget":"image","src":"https://ex.test/a.png","x":0,"y":0,"w":20,"h":20,"enabled":false}]';
    const [el] = parseElements(json);
    expect(el.enabled).toBe(false);
    expect(el.src).toBe("https://ex.test/a.png");
  });
  it("clampElement zachowuje wyłączenie przy przesuwaniu/skalowaniu", () => {
    const el = clampElement({ id: "a", widget: "goals", x: 999, y: 0, w: 20, h: 20, enabled: false });
    expect(el.enabled).toBe(false);
    expect(el.x).toBe(80);
  });
  it("wyłączone elementy dają się odfiltrować przed renderem OBS", () => {
    const els = parseElements('[{"id":"a","widget":"goals","x":0,"y":0,"w":20,"h":20},{"id":"b","widget":"chat","x":0,"y":0,"w":20,"h":20,"enabled":false}]');
    expect(els).toHaveLength(2);
    expect(els.filter(elementEnabled).map((e) => e.id)).toEqual(["a"]);
  });
});

// Warstwy (update 2026-08). Kluczowa zasada: tablica `elements` JEST kolejnością warstw — element
// późniejszy rysuje się na wierzchu. Dzięki temu „na wierzch/pod spód" nie wymaga pola `z`.
describe("moveElement — warstwy", () => {
  const el = (id: string) => ({ id, widget: "goals", x: 0, y: 0, w: 20, h: 20 });
  const ids = (a: { id: string }[]) => a.map((e) => e.id);

  it("na wierzch — przenosi element na KONIEC tablicy (rysowany ostatni = na górze)", () => {
    expect(ids(moveElement([el("a"), el("b"), el("c")], "a", "front"))).toEqual(["b", "c", "a"]);
  });
  it("pod spód — przenosi element na POCZĄTEK tablicy", () => {
    expect(ids(moveElement([el("a"), el("b"), el("c")], "c", "back"))).toEqual(["c", "a", "b"]);
  });
  it("element już na wierzchu/spodzie zostaje na miejscu", () => {
    expect(ids(moveElement([el("a"), el("b")], "b", "front"))).toEqual(["a", "b"]);
    expect(ids(moveElement([el("a"), el("b")], "a", "back"))).toEqual(["a", "b"]);
  });
  it("nieznane id nie rusza tablicy (zwraca ją bez zmian)", () => {
    const wej = [el("a"), el("b")];
    expect(moveElement(wej, "nie-ma", "front")).toBe(wej);
  });
  it("nie gubi ani nie duplikuje elementów", () => {
    const wynik = moveElement([el("a"), el("b"), el("c")], "b", "front");
    expect(wynik).toHaveLength(3);
    expect(new Set(ids(wynik)).size).toBe(3);
  });
  it("zachowuje wyłączenie elementu przy zmianie warstwy", () => {
    const wynik = moveElement([{ ...el("a"), enabled: false }, el("b")], "a", "front");
    expect(wynik[1]).toMatchObject({ id: "a", enabled: false });
  });
});

// Strażnik rozjazdu dwóch katalogów widgetów (audyt 2026-08). Biblioteka widgetów
// (`components/admin/sections/Widgets.tsx` → WIDGET_META) i kreator scen (SCENE_WIDGETS) to
// dwie osobne listy, które przez pół roku niepostrzeżenie się rozjechały: 25 vs 19. Skutek —
// streamer widział widget w bibliotece i nie znajdował go w kreatorze, bez żadnego komunikatu.
//
// Test czyta obie listy z PLIKÓW ŹRÓDŁOWYCH, bo Widgets.tsx to komponent kliencki z importami
// UI, których nie da się zaimportować do czystego unit testu bez ciągnięcia całego Reacta.
describe("SCENE_WIDGETS ↔ biblioteka widgetów", () => {
  const idsZ = (tekst: string, marker: string): string[] => {
    const start = tekst.indexOf(marker);
    const blok = tekst.slice(start, tekst.indexOf("\n];", start));
    return [...blok.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
  };

  it("każdy widget z biblioteki da się postawić na scenie — poza dwoma świadomie wykluczonymi", async () => {
    const { readFileSync } = await import("node:fs");
    const biblioteka = idsZ(readFileSync("src/components/admin/sections/Widgets.tsx", "utf8"), "const WIDGET_META");
    const scena = new Set(idsZ(readFileSync("src/lib/overlay-scenes.ts", "utf8"), "export const SCENE_WIDGETS"));

    // `alerts` to pełnoekranowa warstwa 1920×1080, `obs-control` jest headless — żadnego z nich
    // nie da się sensownie położyć na płótnie. Każdy INNY brak to regresja.
    const WYKLUCZONE = new Set(["alerts", "obs-control"]);
    const brakujace = biblioteka.filter((id) => !scena.has(id) && !WYKLUCZONE.has(id));
    expect(brakujace).toEqual([]);

    // W drugą stronę: kreator nie może oferować widgetu, którego biblioteka nie zna.
    const osierocone = [...scena].filter((id) => !biblioteka.includes(id));
    expect(osierocone).toEqual([]);
  });
});
