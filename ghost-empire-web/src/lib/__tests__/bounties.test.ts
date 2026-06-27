import { describe, it, expect } from "vitest";
import { validatePledge, validateTitle, validateExpiry, MIN_PLEDGE, MAX_PLEDGE, TITLE_MIN, TITLE_MAX, MAX_EXPIRY_HOURS } from "../bounties";

describe("validatePledge", () => {
  it("accepts an integer within range", () => {
    expect(validatePledge(MIN_PLEDGE)).toEqual({ ok: true, amount: MIN_PLEDGE });
    expect(validatePledge(1000)).toEqual({ ok: true, amount: 1000 });
    expect(validatePledge(MAX_PLEDGE)).toEqual({ ok: true, amount: MAX_PLEDGE });
  });
  it("rejects below min / above max", () => {
    expect(validatePledge(MIN_PLEDGE - 1).ok).toBe(false);
    expect(validatePledge(MAX_PLEDGE + 1).ok).toBe(false);
  });
  it("rejects non-integers and non-numbers", () => {
    expect(validatePledge(100.5).ok).toBe(false);
    expect(validatePledge("100").ok).toBe(false);
    expect(validatePledge(null).ok).toBe(false);
    expect(validatePledge(NaN).ok).toBe(false);
  });
});

describe("validateTitle", () => {
  it("accepts and trims a valid title", () => {
    expect(validateTitle("  Zagraj 1h na hardcore  ")).toEqual({ ok: true, title: "Zagraj 1h na hardcore" });
  });
  it("rejects too short / too long / non-string", () => {
    expect(validateTitle("ab").ok).toBe(false); // below TITLE_MIN
    expect(validateTitle("x".repeat(TITLE_MAX + 1)).ok).toBe(false);
    expect(validateTitle("   ").ok).toBe(false); // trims to empty
    expect(validateTitle(123).ok).toBe(false);
    expect(validateTitle(null).ok).toBe(false);
  });
  it("accepts exactly at the boundaries", () => {
    expect(validateTitle("x".repeat(TITLE_MIN)).ok).toBe(true);
    expect(validateTitle("x".repeat(TITLE_MAX)).ok).toBe(true);
  });
});

describe("validateExpiry", () => {
  it("treats undefined / null / 0 as no expiry", () => {
    expect(validateExpiry(undefined)).toEqual({ ok: true, hours: null });
    expect(validateExpiry(null)).toEqual({ ok: true, hours: null });
    expect(validateExpiry(0)).toEqual({ ok: true, hours: null });
  });
  it("accepts integer hours within 1..MAX", () => {
    expect(validateExpiry(1)).toEqual({ ok: true, hours: 1 });
    expect(validateExpiry(168)).toEqual({ ok: true, hours: 168 });
    expect(validateExpiry(MAX_EXPIRY_HOURS)).toEqual({ ok: true, hours: MAX_EXPIRY_HOURS });
  });
  it("rejects out-of-range and non-integers", () => {
    expect(validateExpiry(MAX_EXPIRY_HOURS + 1).ok).toBe(false);
    expect(validateExpiry(-5).ok).toBe(false);
    expect(validateExpiry(1.5).ok).toBe(false);
    expect(validateExpiry("24").ok).toBe(false);
  });
});
