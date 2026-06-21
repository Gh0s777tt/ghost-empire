import { describe, it, expect } from "vitest";
import { generateDonationCode, extractDonationCode, isValidDonationCode } from "@/lib/donation-code";

describe("generateDonationCode", () => {
  it("produces a GE-prefixed 6-char code from the safe alphabet", () => {
    const c = generateDonationCode(() => 0);
    expect(c).toMatch(/^GE-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(isValidDonationCode(c)).toBe(true);
  });
  it("never emits ambiguous characters (0/O/1/I)", () => {
    for (let r = 0; r < 1; r += 0.017) {
      expect(generateDonationCode(() => r)).not.toMatch(/[0O1I]/);
    }
  });
});

describe("extractDonationCode", () => {
  it("finds a code in a free-text message (case-insensitive)", () => {
    expect(extractDonationCode("thanks! ge-abc234 keep it up")).toBe("GE-ABC234");
    expect(extractDonationCode("GE-ABC234")).toBe("GE-ABC234");
  });
  it("returns null when no code is present", () => {
    expect(extractDonationCode("just a nice message")).toBeNull();
    expect(extractDonationCode(null)).toBeNull();
    expect(extractDonationCode("")).toBeNull();
  });
});

describe("isValidDonationCode", () => {
  it("rejects malformed codes", () => {
    expect(isValidDonationCode("GE-ABC23")).toBe(false); // too short
    expect(isValidDonationCode("ABC234")).toBe(false); // missing prefix
    expect(isValidDonationCode("GE-ABC2O4")).toBe(false); // contains ambiguous 'O'
  });
});
