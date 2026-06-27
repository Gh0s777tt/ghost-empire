import { describe, it, expect } from "vitest";
import { streamingChannels, channelLabel } from "@/lib/channels";

describe("channelLabel", () => {
  it("strips scheme, www and trailing slash", () => {
    expect(channelLabel("https://twitch.tv/foo")).toBe("twitch.tv/foo");
    expect(channelLabel("https://www.youtube.com/@Bar/")).toBe("youtube.com/@Bar");
    expect(channelLabel("http://kick.com/baz")).toBe("kick.com/baz");
  });
});

describe("streamingChannels", () => {
  it("returns the founder defaults (twitch, kick) for the founder portal with no socials", () => {
    expect(streamingChannels(null, true).map((c) => c.label)).toEqual([
      "twitch.tv/gh0s77tt",
      "kick.com/gh0s77tt",
    ]);
  });

  it("returns nothing for a sub-tenant with no socials (never leaks the founder's)", () => {
    expect(streamingChannels(null, false)).toEqual([]);
  });

  it("uses the tenant's own streaming links, ordered twitch > kick > youtube", () => {
    const ch = streamingChannels(
      [
        { platform: "kick", url: "https://kick.com/her" },
        { platform: "twitch", url: "https://twitch.tv/her" },
      ],
      false,
    );
    expect(ch.map((c) => c.url)).toEqual(["https://twitch.tv/her", "https://kick.com/her"]);
  });

  it("ignores non-streaming socials → [] for a sub-tenant (no founder fallback)", () => {
    expect(streamingChannels([{ platform: "instagram", url: "https://instagram.com/her" }], false)).toEqual([]);
  });

  it("a configured founder portal uses its OWN links, not the hardcoded defaults", () => {
    const ch = streamingChannels([{ platform: "youtube", url: "https://youtube.com/@me" }], true);
    expect(ch.map((c) => c.label)).toEqual(["youtube.com/@me"]);
  });
});
