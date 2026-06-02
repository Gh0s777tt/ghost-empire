import { describe, it, expect } from "vitest";
import { displayNick } from "../utils";

// displayNick is the privacy helper that decides what name to show publicly.
// Core rule: a value containing a space is a leaked full name (e.g. from Google)
// and must NEVER be shown — fall back to the username, else "Anonim".
describe("displayNick", () => {
  it("returns a clean handle (no spaces) as-is", () => {
    expect(displayNick("gh0s77tt", "gh0s77tt")).toBe("gh0s77tt");
    expect(displayNick("Ghost", null)).toBe("Ghost");
  });

  it("falls back to username when displayName looks like a full name (has a space)", () => {
    expect(displayNick("Jan Kowalski", "jan_k")).toBe("jan_k");
    expect(displayNick("Imię Nazwisko", "ghost77")).toBe("ghost77");
  });

  it("never returns a spaced full name; uses 'Anonim' when there is no username", () => {
    expect(displayNick("Jan Kowalski", null)).toBe("Anonim");
    expect(displayNick("Imię Nazwisko", undefined)).toBe("Anonim");
  });

  it("uses the username when displayName is empty / whitespace / null", () => {
    expect(displayNick(null, "nick")).toBe("nick");
    expect(displayNick("", "nick")).toBe("nick");
    expect(displayNick("   ", "nick")).toBe("nick");
  });

  it("returns 'Anonim' when both are missing", () => {
    expect(displayNick(null, null)).toBe("Anonim");
    expect(displayNick(undefined, undefined)).toBe("Anonim");
  });

  it("trims a clean handle", () => {
    expect(displayNick("  ghost  ", null)).toBe("ghost");
  });
});
