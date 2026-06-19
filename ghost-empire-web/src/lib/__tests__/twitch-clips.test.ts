import { describe, it, expect } from "vitest";
import { isoWeekKey } from "@/lib/twitch-clips";

describe("isoWeekKey", () => {
  it("formats as YYYY-Www", () => {
    expect(isoWeekKey(new Date("2026-06-15T12:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("pins week 1 to the week holding the first Thursday", () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
  });

  it("gives the same key for Monday and Sunday of one week", () => {
    const mon = isoWeekKey(new Date("2026-06-15T00:00:00Z")); // Monday
    const sun = isoWeekKey(new Date("2026-06-21T23:59:59Z")); // Sunday same week
    expect(mon).toBe(sun);
  });

  it("rolls over to a different key the next week", () => {
    const w1 = isoWeekKey(new Date("2026-06-21T00:00:00Z")); // Sunday
    const w2 = isoWeekKey(new Date("2026-06-22T00:00:00Z")); // next Monday
    expect(w1).not.toBe(w2);
  });
});
