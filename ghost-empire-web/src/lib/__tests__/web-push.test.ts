import { describe, it, expect } from "vitest";
import { buildPushPayload, isGonePushError } from "@/lib/web-push";

describe("buildPushPayload", () => {
  it("fills sensible defaults for url + icon", () => {
    const out = JSON.parse(buildPushPayload({ title: "Hi", body: "There" }));
    expect(out).toMatchObject({ title: "Hi", body: "There", url: "/", icon: "/icons/icon-192.png" });
  });

  it("keeps an explicit url, icon and tag", () => {
    const out = JSON.parse(buildPushPayload({ title: "T", body: "B", url: "/support", icon: "/x.png", tag: "live" }));
    expect(out).toMatchObject({ url: "/support", icon: "/x.png", tag: "live" });
  });

  it("clamps over-long title and body", () => {
    const out = JSON.parse(buildPushPayload({ title: "a".repeat(500), body: "b".repeat(500) }));
    expect(out.title).toHaveLength(120);
    expect(out.body).toHaveLength(300);
  });

  it("always produces valid JSON", () => {
    expect(() => JSON.parse(buildPushPayload({ title: 'q"u\\ote', body: "ünïcödé 🎉" }))).not.toThrow();
  });
});

describe("isGonePushError", () => {
  it("treats 404 and 410 as dead endpoints", () => {
    expect(isGonePushError(404)).toBe(true);
    expect(isGonePushError(410)).toBe(true);
  });

  it("does not prune on other / missing status codes", () => {
    for (const c of [undefined, 200, 201, 400, 401, 429, 500, 503]) expect(isGonePushError(c)).toBe(false);
  });
});
