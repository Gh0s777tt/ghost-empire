import { describe, it, expect } from "vitest";
import { mapXboxTitles } from "@/lib/xbox";

describe("mapXboxTitles", () => {
  it("maps a typical OpenXBL titleHistory payload", () => {
    const out = mapXboxTitles({
      titles: [
        {
          titleId: 12345,
          name: "Halo Infinite",
          displayImage: "https://img/halo.png",
          titleHistory: { lastTimePlayed: "2026-06-01T10:00:00.000Z" },
        },
      ],
    });
    expect(out).toEqual([
      { id: "12345", name: "Halo Infinite", image: "https://img/halo.png", lastPlayed: "2026-06-01T10:00:00.000Z" },
    ]);
  });

  it("falls back to the images[] array when displayImage is absent", () => {
    const out = mapXboxTitles({
      titles: [
        { titleId: "9", name: "Forza", images: [{ url: "https://i/logo.png", type: "Logo" }, { url: "https://i/box.png", type: "BoxArt" }] },
        { titleId: "10", name: "Sea of Thieves", images: [{ url: "https://i/any.png", type: "Tile" }] },
      ],
    });
    expect(out[0].image).toBe("https://i/box.png"); // BoxArt/Logo preferred
    expect(out[1].image).toBe("https://i/any.png"); // any url as last resort
  });

  it("skips entries without a usable id or name, and handles missing image/date", () => {
    const out = mapXboxTitles({
      titles: [
        { titleId: "1", name: "Valid" },
        { name: "No id" },
        { titleId: "2", name: "   " },
        { titleId: "3", name: "No image" },
      ],
    });
    expect(out.map((t) => t.name)).toEqual(["Valid", "No image"]);
    expect(out[0]).toEqual({ id: "1", name: "Valid", image: null, lastPlayed: null });
  });

  it("returns [] for non-array / malformed payloads", () => {
    expect(mapXboxTitles(null)).toEqual([]);
    expect(mapXboxTitles({})).toEqual([]);
    expect(mapXboxTitles({ titles: "nope" })).toEqual([]);
    expect(mapXboxTitles([])).toEqual([]);
  });
});
