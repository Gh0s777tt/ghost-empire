import { describe, it, expect } from "vitest";
import { monthBounds } from "@/lib/seasons";

// monthBounds is the pure core of the monthly Battle Pass rollover: it derives the UTC
// month window, the season number (months since the Jan-2026 project epoch, +1) and a PL
// label. Off-by-one bugs in month/epoch math are exactly what these regression tests guard.
describe("monthBounds", () => {
  it("derives UTC month boundaries (start of this month → start of next)", () => {
    const { start, end } = monthBounds(new Date(Date.UTC(2026, 5, 15, 13, 30, 0))); // 15 Jun 2026
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("numbers seasons from the Jan-2026 epoch (Jan 2026 = 1)", () => {
    expect(monthBounds(new Date(Date.UTC(2026, 0, 1))).number).toBe(1); // January
    expect(monthBounds(new Date(Date.UTC(2026, 5, 9))).number).toBe(6); // June
    expect(monthBounds(new Date(Date.UTC(2026, 11, 31))).number).toBe(12); // December
    expect(monthBounds(new Date(Date.UTC(2027, 0, 1))).number).toBe(13); // next year rolls over
  });

  it("rolls the END into the next year for December", () => {
    const { start, end, number } = monthBounds(new Date(Date.UTC(2026, 11, 20)));
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(number).toBe(12);
  });

  it("produces the Polish month label", () => {
    expect(monthBounds(new Date(Date.UTC(2026, 0, 5))).label).toBe("Styczeń 2026");
    expect(monthBounds(new Date(Date.UTC(2026, 5, 5))).label).toBe("Czerwiec 2026");
    expect(monthBounds(new Date(Date.UTC(2027, 11, 5))).label).toBe("Grudzień 2027");
  });

  it("uses UTC, not local time, at a day boundary", () => {
    // 2026-07-01T00:30 UTC is firmly July in UTC regardless of the runner's timezone.
    const { start, number, label } = monthBounds(new Date(Date.UTC(2026, 6, 1, 0, 30)));
    expect(start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(number).toBe(7);
    expect(label).toBe("Lipiec 2026");
  });

  it("advances the number by exactly 12 per year", () => {
    const a = monthBounds(new Date(Date.UTC(2026, 4, 1))).number; // May 2026
    const b = monthBounds(new Date(Date.UTC(2027, 4, 1))).number; // May 2027
    expect(b - a).toBe(12);
  });
});
