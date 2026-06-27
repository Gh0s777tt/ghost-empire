import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  xpForLevel,
  levelFromXp,
  rankForLevel,
  pluralPL,
  fmt,
  timeLeft,
  timeAgo,
  formatDate,
  formatSeasonLabel,
  verifyBotSecret,
  verifyBotSecretForTenant,
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
  it("groups thousands using the pl-PL locale by default", () => {
    const out = fmt(1234567);
    // pl-PL uses some kind of space as the thousands separator (ICU-dependent;
    // \s also matches the no-break U+00A0 / U+202F variants). Strip it, then
    // assert the digits survive AND that grouping actually happened.
    expect(out.replace(/\s/g, "")).toBe("1234567");
    expect(out).not.toBe("1234567");
  });

  it("groups with commas for the en locale", () => {
    expect(fmt(1234567, "en")).toBe("1,234,567");
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

  it("uses the English ended label when locale is en", () => {
    expect(timeLeft(new Date(Date.now() - 1000), "en")).toBe("Ended");
  });
});

describe("timeAgo (locale, Intl.RelativeTimeFormat)", () => {
  it("formats relative time in Polish by default", () => {
    expect(timeAgo(new Date())).toBe("teraz");
    expect(timeAgo(new Date(Date.now() - (5 * 60 + 30) * 1000))).toMatch(/^5 /); // "5 minut temu"
    expect(timeAgo(new Date(Date.now() - 25 * 3_600_000))).toBe("wczoraj");
  });

  it("formats relative time in English for en", () => {
    expect(timeAgo(new Date(), "en")).toBe("now");
    expect(timeAgo(new Date(Date.now() - (5 * 60 + 30) * 1000), "en")).toMatch(/5 minute/); // "5 minutes ago"
    expect(timeAgo(new Date(Date.now() - 25 * 3_600_000), "en")).toBe("yesterday");
    expect(timeAgo(new Date(Date.now() - 73 * 3_600_000), "en")).toMatch(/3 days/);
  });

  it("localizes relative time for other locales via Intl (German / Russian)", () => {
    expect(timeAgo(new Date(Date.now() - 25 * 3_600_000), "de")).toBe("gestern");
    expect(timeAgo(new Date(Date.now() - (5 * 60 + 30) * 1000), "ru")).toMatch(/5 минут/);
  });
});

describe("formatDate (locale)", () => {
  it("uses the Polish month name by default", () => {
    expect(formatDate(new Date(2026, 5, 15))).toMatch(/cze/);
  });

  it("uses the English month name for en", () => {
    expect(formatDate(new Date(2026, 5, 15), "en")).toMatch(/Jun/);
  });
});

describe("formatSeasonLabel (localized, capitalized)", () => {
  it("uses the Polish month + year by default, capitalized", () => {
    expect(formatSeasonLabel(6)).toBe("Czerwiec 2026"); // season 6 = June 2026
    expect(formatSeasonLabel(1)).toBe("Styczeń 2026"); // season 1 = Jan 2026
  });
  it("localizes per locale", () => {
    expect(formatSeasonLabel(6, "en")).toBe("June 2026");
    expect(formatSeasonLabel(1, "en")).toBe("January 2026");
    expect(formatSeasonLabel(6, "de")).toMatch(/Juni 2026/);
  });
  it("rolls the year over after December", () => {
    expect(formatSeasonLabel(12, "en")).toBe("December 2026");
    expect(formatSeasonLabel(13, "en")).toBe("January 2027");
    expect(formatSeasonLabel(18, "en")).toBe("June 2027");
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

describe("verifyBotSecretForTenant (Batch B)", () => {
  beforeEach(() => {
    vi.stubEnv("BOT_SECRET", "global-s3cr3t");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the global BOT_SECRET regardless of the tenant secret (back-compat)", () => {
    expect(verifyBotSecretForTenant("Bearer global-s3cr3t", null)).toBe(true);
    expect(verifyBotSecretForTenant("Bearer global-s3cr3t", "tenant-key")).toBe(true);
  });

  it("accepts a matching per-tenant secret", () => {
    expect(verifyBotSecretForTenant("Bearer tenant-key", "tenant-key")).toBe(true);
  });

  it("rejects a header that matches neither the global nor the tenant secret", () => {
    expect(verifyBotSecretForTenant("Bearer nope", "tenant-key")).toBe(false);
  });

  it("rejects when the tenant has no secret and the global doesn't match", () => {
    expect(verifyBotSecretForTenant("Bearer tenant-key", null)).toBe(false);
    expect(verifyBotSecretForTenant("Bearer tenant-key", undefined)).toBe(false);
  });

  it("rejects a missing header even with a tenant secret set", () => {
    expect(verifyBotSecretForTenant(null, "tenant-key")).toBe(false);
  });

  it("does not let an empty tenant secret authenticate an empty bearer", () => {
    expect(verifyBotSecretForTenant("Bearer ", "")).toBe(false);
  });
});
