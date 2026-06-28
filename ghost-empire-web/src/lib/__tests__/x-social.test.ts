import { describe, it, expect } from "vitest";
import { normalizeXUsername, parseXUser, parseXTweets } from "../x-social";

describe("normalizeXUsername", () => {
  it("strips @ and url wrappers", () => {
    expect(normalizeXUsername("@gh0st")).toBe("gh0st");
    expect(normalizeXUsername("gh0st")).toBe("gh0st");
    expect(normalizeXUsername("https://x.com/gh0st")).toBe("gh0st");
    expect(normalizeXUsername("https://twitter.com/@gh0st")).toBe("gh0st");
    expect(normalizeXUsername("  GH0ST_77 ")).toBe("GH0ST_77");
  });
  it("rejects invalid / empty / too-long handles", () => {
    expect(normalizeXUsername("")).toBeNull();
    expect(normalizeXUsername(null)).toBeNull();
    expect(normalizeXUsername("bad handle!")).toBeNull();
    expect(normalizeXUsername("waytoolongusername")).toBeNull(); // > 15
  });
});

describe("parseXUser", () => {
  it("extracts id, name, followers and upsizes the avatar", () => {
    const out = parseXUser({
      data: {
        id: "123",
        name: "Ghost",
        username: "gh0st",
        public_metrics: { followers_count: 4200 },
        profile_image_url: "https://pbs.twimg.com/profile_images/1/abc_normal.jpg",
      },
    });
    expect(out).toEqual({ id: "123", name: "Ghost", followers: 4200, avatarUrl: "https://pbs.twimg.com/profile_images/1/abc_400x400.jpg" });
  });
  it("defaults followers to 0 and tolerates missing fields", () => {
    expect(parseXUser({ data: { id: "9" } })).toEqual({ id: "9", name: null, followers: 0, avatarUrl: null });
  });
  it("returns null on a bad shape", () => {
    expect(parseXUser(null)).toBeNull();
    expect(parseXUser({})).toBeNull();
    expect(parseXUser({ data: { id: 5 } })).toBeNull(); // non-string id
  });
});

describe("parseXTweets", () => {
  it("maps tweets to post cards with the right url", () => {
    const out = parseXTweets({ data: [{ id: "555", text: "hello", created_at: "2026-06-28T10:00:00Z" }] }, "gh0st");
    expect(out).toEqual([{ id: "555", text: "hello", createdAt: "2026-06-28T10:00:00Z", url: "https://x.com/gh0st/status/555" }]);
  });
  it("skips malformed entries and tolerates a missing date", () => {
    const out = parseXTweets({ data: [{ id: "1", text: "ok" }, { id: 2, text: "nope" }, { text: "noid" }] }, "u");
    expect(out).toEqual([{ id: "1", text: "ok", createdAt: null, url: "https://x.com/u/status/1" }]);
  });
  it("returns [] on a bad shape", () => {
    expect(parseXTweets({}, "u")).toEqual([]);
    expect(parseXTweets({ data: "x" }, "u")).toEqual([]);
  });
});
