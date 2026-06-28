import { describe, it, expect } from "vitest";
import { oembedUrlFor, normalizeRequester } from "@/lib/song-requests";

describe("oembedUrlFor", () => {
  it("builds a YouTube oEmbed URL (watch + youtu.be)", () => {
    expect(oembedUrlFor("https://www.youtube.com/watch?v=abc")).toBe(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc&format=json",
    );
    expect(oembedUrlFor("https://youtu.be/abc")).toContain("youtube.com/oembed");
  });
  it("builds a Spotify oEmbed URL", () => {
    expect(oembedUrlFor("https://open.spotify.com/track/xyz")).toContain("open.spotify.com/oembed");
  });
  it("returns null for non-URLs and unsupported hosts", () => {
    expect(oembedUrlFor("just a song title")).toBeNull();
    expect(oembedUrlFor("https://soundcloud.com/foo")).toBeNull();
    expect(oembedUrlFor("ftp://youtube.com/x")).toBeNull();
  });
});

describe("normalizeRequester", () => {
  it("trims, lowercases and caps the handle", () => {
    expect(normalizeRequester("  GhostFan  ")).toBe("ghostfan");
    expect(normalizeRequester("ABC")).toBe("abc");
    expect(normalizeRequester("x".repeat(120)).length).toBe(80);
  });
});
