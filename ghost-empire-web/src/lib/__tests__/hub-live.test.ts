// src/lib/__tests__/hub-live.test.ts
import { describe, it, expect } from "vitest";
import { hubPlatformTiles, hubLive } from "@/lib/hub";

const NOW = new Date("2026-07-26T20:00:00Z");
const at = (iso: string) => new Date(iso);

describe("hubPlatformTiles — a streamer's hub shows THEIR channels or none", () => {
  it("renders one tile per recognised platform, in the portal's own order", () => {
    const t = hubPlatformTiles([
      { platform: "kick", url: "https://kick.com/someone" },
      { platform: "twitch", url: "https://twitch.tv/someone" },
    ]);
    expect(t.map((x) => x.platform)).toEqual(["kick", "twitch"]);
    expect(t[0].label).toBe("Kick");
  });

  it("renders NOTHING when the portal has no socials — never a founder fallback", () => {
    // parseTenantSocials falls back to the founder's channels when a tenant has none, which is right
    // for the footer and would be a white-label LEAK here: another streamer's link-in-bio page would
    // advertise the founder's Twitch.
    expect(hubPlatformTiles(null)).toEqual([]);
    expect(hubPlatformTiles([])).toEqual([]);
    expect(hubPlatformTiles(undefined)).toEqual([]);
  });

  it("drops an unknown platform instead of labelling a tile with a raw key", () => {
    expect(hubPlatformTiles([{ platform: "myspace", url: "https://myspace.com/x" }])).toEqual([]);
  });

  it("drops a non-http URL, which is what keeps javascript: off a public page", () => {
    expect(hubPlatformTiles([{ platform: "twitch", url: "javascript:alert(1)" }])).toEqual([]);
    expect(hubPlatformTiles([{ platform: "twitch", url: "" }])).toEqual([]);
  });

  it("keeps the first entry when a platform is listed twice", () => {
    const t = hubPlatformTiles([
      { platform: "twitch", url: "https://twitch.tv/first" },
      { platform: "TWITCH", url: "https://twitch.tv/second" },
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].url).toContain("first");
  });
});

describe("hubLive — a false 'live' costs trust, a missed one costs a click", () => {
  it("reports the most recently started open session", () => {
    const live = hubLive([
      { platform: "twitch", startedAt: at("2026-07-26T18:00:00Z"), endedAt: null },
      { platform: "kick", startedAt: at("2026-07-26T19:30:00Z"), endedAt: null },
    ], NOW)!;
    expect(live.platform).toBe("kick");
    expect(live.label).toBe("Kick");
  });

  it("ignores a session that already ended", () => {
    expect(hubLive([{ platform: "twitch", startedAt: at("2026-07-26T19:00:00Z"), endedAt: at("2026-07-26T19:45:00Z") }], NOW)).toBeNull();
  });

  it("ignores a STALE open session — a missed offline webhook must not claim a week-long stream", () => {
    // endedAt is set by an EventSub stream.offline webhook; a missed one leaves the row open forever.
    expect(hubLive([{ platform: "twitch", startedAt: at("2026-07-20T10:00:00Z"), endedAt: null }], NOW)).toBeNull();
    expect(hubLive([{ platform: "twitch", startedAt: at("2026-07-26T02:00:00Z"), endedAt: null }], NOW)).not.toBeNull();
  });

  it("ignores a session starting in the future — a clock skew must not fake a live badge", () => {
    expect(hubLive([{ platform: "twitch", startedAt: at("2026-07-26T21:00:00Z"), endedAt: null }], NOW)).toBeNull();
  });

  it("falls back to the raw platform name as the label rather than dropping a live stream", () => {
    const live = hubLive([{ platform: "trovo", startedAt: at("2026-07-26T19:00:00Z"), endedAt: null }], NOW)!;
    expect(live.label).toBe("trovo");
  });

  it("returns null for an empty list", () => {
    expect(hubLive([], NOW)).toBeNull();
  });
});
