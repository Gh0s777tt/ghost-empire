import { describe, it, expect } from "vitest";
import { normalizeIgUserId, parseIgUser, parseIgMedia } from "../meta-social";

describe("normalizeIgUserId", () => {
  it("accepts a numeric id, rejects everything else", () => {
    expect(normalizeIgUserId("17841400000000000")).toBe("17841400000000000");
    expect(normalizeIgUserId("  123 ")).toBe("123");
    expect(normalizeIgUserId("@handle")).toBeNull();
    expect(normalizeIgUserId("12a3")).toBeNull();
    expect(normalizeIgUserId("")).toBeNull();
    expect(normalizeIgUserId(null)).toBeNull();
  });
});

describe("parseIgUser", () => {
  it("extracts username, followers, avatar", () => {
    expect(parseIgUser({ username: "gh0st", followers_count: 1234, profile_picture_url: "https://cdn/x.jpg" })).toEqual({
      username: "gh0st",
      followers: 1234,
      avatarUrl: "https://cdn/x.jpg",
    });
  });
  it("tolerates a missing avatar / count", () => {
    expect(parseIgUser({ username: "gh0st" })).toEqual({ username: "gh0st", followers: 0, avatarUrl: null });
  });
  it("returns null on a Graph error shape / empty", () => {
    expect(parseIgUser({ error: { message: "bad token" } })).toBeNull();
    expect(parseIgUser(null)).toBeNull();
    expect(parseIgUser("nope")).toBeNull();
  });
});

describe("parseIgMedia", () => {
  it("maps media to post cards (media_url, falls back to thumbnail_url)", () => {
    const out = parseIgMedia({
      data: [
        { id: "1", caption: "hi", permalink: "https://instagram.com/p/1", media_url: "https://cdn/1.jpg", timestamp: "2026-06-28T10:00:00+0000" },
        { id: "2", permalink: "https://instagram.com/p/2", thumbnail_url: "https://cdn/2t.jpg" },
      ],
    });
    expect(out).toEqual([
      { id: "1", caption: "hi", permalink: "https://instagram.com/p/1", imageUrl: "https://cdn/1.jpg", createdAt: "2026-06-28T10:00:00+0000" },
      { id: "2", caption: null, permalink: "https://instagram.com/p/2", imageUrl: "https://cdn/2t.jpg", createdAt: null },
    ]);
  });
  it("skips entries without id/permalink and tolerates a bad shape", () => {
    expect(parseIgMedia({ data: [{ id: "1" }, { permalink: "x" }] })).toEqual([]);
    expect(parseIgMedia({})).toEqual([]);
    expect(parseIgMedia({ data: "x" })).toEqual([]);
  });
});
