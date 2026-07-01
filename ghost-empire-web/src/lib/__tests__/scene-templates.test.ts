// src/lib/__tests__/scene-templates.test.ts — catalog integrity for #771.
import { describe, it, expect } from "vitest";
import { SCENE_TEMPLATES, sceneTemplate } from "@/lib/scene-templates";
import { sceneWidget, clampElement, parseElements, MAX_ELEMENTS } from "@/lib/overlay-scenes";

describe("SCENE_TEMPLATES catalog", () => {
  it("has unique ids and a sane size", () => {
    const ids = SCENE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(4);
  });

  it("uses only known scene widgets", () => {
    for (const t of SCENE_TEMPLATES) {
      for (const e of t.elements) {
        expect(sceneWidget(e.widget), `${t.id} → ${e.widget}`).not.toBeNull();
      }
    }
  });

  it("keeps every element fully on-canvas (clamp is a no-op) and under the cap", () => {
    for (const t of SCENE_TEMPLATES) {
      expect(t.elements.length).toBeLessThanOrEqual(MAX_ELEMENTS);
      for (const e of t.elements) {
        expect(clampElement(e), `${t.id} → ${e.widget}`).toEqual(e);
      }
    }
  });

  it("round-trips through parseElements without losing elements", () => {
    for (const t of SCENE_TEMPLATES) {
      const parsed = parseElements(JSON.stringify(t.elements));
      expect(parsed, t.id).toHaveLength(t.elements.length);
    }
  });
});

describe("sceneTemplate", () => {
  it("looks up by id and rejects junk", () => {
    expect(sceneTemplate("stream-hud")?.elements.length).toBeGreaterThan(0);
    expect(sceneTemplate("nope")).toBeNull();
    expect(sceneTemplate(42)).toBeNull();
    expect(sceneTemplate(null)).toBeNull();
  });
});
