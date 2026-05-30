import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  xpForLevel,
  levelFromXp,
  rankForLevel,
  pluralPL,
  fmt,
  timeLeft,
  verifyBotSecret,
} from "@/lib/utils";

describe("xpForLevel / levelFromXp", () => {
  it("xpForLevel = level * 500", () => {
    expect(xpForLevel(1)).toBe(500);
    expect(xpForLevel(10)).toBe(5000);
  });

  it("levelFromXp is the floored inverse, never below 1", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(499)).toBe(1);
    expect(levelFromXp(500)).toBe(1);
    expect(levelFromXp(1000)).toBe(2);
    expect(levelFromXp(5250)).toBe(10);
  });
});

describe("rankForLevel", () => {
  it("maps a level to the right rank tier at each boundary", () => {
    expect(rankForLevel(1).name).toBe("GHOSTLING");
    expect(rankForLevel(4).name).toBe("GHOSTLING");
    expect(rankForLevel(5).name).toBe("SHADOW");
    expect(rankForLevel(15).name).toBe("SPECTER");
    expect(rankForLevel(30).name).toBe("HAUNT");
    expect(rankForLevel(50).name).toBe("WRAITH");
    expect(rankForLevel(75).name).toBe("PHANTOM LORD");
    expect(rankForLevel(100).name).toBe("GH0ST GOD");
    expect(rankForLevel(999).name).toBe("GH0ST GOD");
  });
});

describe("pluralPL", () => {
  it("applies the simplified Polish plural rule (1 / 2-4 / rest)", () => {
    expect(pluralPL(1, "punkt", "punkty", "punktow")).toBe("1 punkt");
    expect(pluralPL(2, "punkt", "punkty", "punktow")).toBe("2 punkty");
    expect(pluralPL(4, "punkt", "punkty", "punktow")).toBe("4 punkty");
    expect(pluralPL(5, "punkt", "punkty", "punktow")).toBe("5 punktow");
    expect(pluralPL(0, "punkt", "punkty", "punktow")).toBe("0 punktow");
  });
});

describe("fmt", () => {
  it("groups thousands using the pl-PL locale", () => {
    const out = fmt(1234567);
    // pl-PL uses some kind of space as the thousands separator (ICU-dependent;
    // \s also matches the no-break U+00A0 / U+202F variants). Strip it, then
    // assert the digits survive AND that grouping actually happened.
    expect(out.replace(/\s/g, "")).toBe("1234567");
    expect(out).not.toBe("1234567");
  });
});

describe("timeLeft", () => {
  it("returns Zakonczony once the target is in the past", () => {
    expect(timeLeft(new Date(Date.now() - 1000))).toBe("Zakończony");
  });

  it("shows only minutes under an hour", () => {
    expect(timeLeft(new Date(Date.now() + 30 * 60_000 + 5_000))).toBe("30m");
  });

  it("shows hours and minutes between 1h and 48h", () => {
    expect(timeLeft(new Date(Date.now() + (2 * 60 + 15) * 60_000 + 5_000))).toBe("2h 15m");
  });

  it("collapses to days beyond 48h", () => {
    expect(timeLeft(new Date(Date.now() + 73 * 3_600_000))).toBe("3d");
  });
});

describe("verifyBotSecret", () => {
  beforeEach(() => {
    vi.stubEnv("BOT_SECRET", "s3cr3t");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the matching Bearer secret", () => {
    expect(verifyBotSecret("Bearer s3cr3t")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(verifyBotSecret("Bearer nope")).toBe(false);
  });

  it("rejects a missing or empty header", () => {
    expect(verifyBotSecret(null)).toBe(false);
    expect(verifyBotSecret("")).toBe(false);
  });
});
