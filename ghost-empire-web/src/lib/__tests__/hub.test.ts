// src/lib/__tests__/hub.test.ts
import { describe, it, expect } from "vitest";
import { parseHubLinks, sanitizeHubBio, isHttpUrl, HUB_MAX_LINKS, HUB_LABEL_MAX } from "@/lib/hub";

describe("isHttpUrl", () => {
  it("accepts http/https, rejects other schemes", () => {
    expect(isHttpUrl("https://twitch.tv/x")).toBe(true);
    expect(isHttpUrl("http://x.com")).toBe(true);
    expect(isHttpUrl("  https://x.com  ")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,x")).toBe(false);
    expect(isHttpUrl("ftp://x")).toBe(false);
    expect(isHttpUrl("/relative")).toBe(false);
  });
});

describe("parseHubLinks", () => {
  it("keeps valid links and preserves order", () => {
    const out = parseHubLinks([
      { id: "a", label: "Twitch", url: "https://twitch.tv/x", icon: "🎮" },
      { id: "b", label: "Discord", url: "https://discord.gg/x" },
    ]);
    expect(out).toEqual([
      { id: "a", label: "Twitch", url: "https://twitch.tv/x", icon: "🎮" },
      { id: "b", label: "Discord", url: "https://discord.gg/x" },
    ]);
  });

  it("drops entries with no label or a non-http(s) url (XSS-safe)", () => {
    const out = parseHubLinks([
      { label: "", url: "https://x.com" },
      { label: "Bad", url: "javascript:alert(1)" },
      { label: "Ok", url: "https://ok.com" },
    ]);
    expect(out.map((l) => l.label)).toEqual(["Ok"]);
  });

  it("trims label to the max and omits an empty icon", () => {
    const [l] = parseHubLinks([{ label: "x".repeat(100), url: "https://x.com", icon: "   " }]);
    expect(l.label).toHaveLength(HUB_LABEL_MAX);
    expect(l.icon).toBeUndefined();
  });

  it("falls back to a generated id when missing", () => {
    const out = parseHubLinks([{ label: "A", url: "https://a.com" }, { label: "B", url: "https://b.com" }]);
    expect(out[0].id).toBe("l0");
    expect(out[1].id).toBe("l1");
  });

  it("caps at HUB_MAX_LINKS", () => {
    const many = Array.from({ length: HUB_MAX_LINKS + 5 }, (_, i) => ({ label: `L${i}`, url: `https://x${i}.com` }));
    expect(parseHubLinks(many)).toHaveLength(HUB_MAX_LINKS);
  });

  it("returns [] for non-array / junk input", () => {
    expect(parseHubLinks(null)).toEqual([]);
    expect(parseHubLinks("nope")).toEqual([]);
    expect(parseHubLinks([1, "x", null, {}])).toEqual([]);
  });
});

describe("sanitizeHubBio", () => {
  it("trims, caps, and nulls empties", () => {
    expect(sanitizeHubBio("  hi  ")).toBe("hi");
    expect(sanitizeHubBio("")).toBeNull();
    expect(sanitizeHubBio("   ")).toBeNull();
    expect(sanitizeHubBio(42)).toBeNull();
    expect((sanitizeHubBio("x".repeat(500)) ?? "").length).toBe(200);
  });
});
