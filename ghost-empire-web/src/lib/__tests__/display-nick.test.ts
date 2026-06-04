import { describe, it, expect } from "vitest";
import { displayNick, isPublicHandle } from "../utils";

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

// isPublicHandle decides whether a connection username may be shown as an @handle.
// It must reject leaked full names (spaces) AND email local-part fallbacks (dots),
// e.g. a Google login with no YouTube handle stored "dzierzawskii98.dam".
describe("isPublicHandle", () => {
  it("accepts real platform handles", () => {
    expect(isPublicHandle("gh0s77tt")).toBe(true);
    expect(isPublicHandle("Ghost_77")).toBe(true);
  });

  it("rejects an email local-part fallback (contains a dot)", () => {
    expect(isPublicHandle("dzierzawskii98.dam")).toBe(false);
    expect(isPublicHandle("john.doe")).toBe(false);
  });

  it("rejects a leaked full name (contains a space)", () => {
    expect(isPublicHandle("Jan Kowalski")).toBe(false);
  });

  it("rejects empty / whitespace / null / undefined", () => {
    expect(isPublicHandle(null)).toBe(false);
    expect(isPublicHandle(undefined)).toBe(false);
    expect(isPublicHandle("")).toBe(false);
    expect(isPublicHandle("   ")).toBe(false);
  });
});
