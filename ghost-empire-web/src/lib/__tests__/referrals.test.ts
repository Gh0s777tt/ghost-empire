import { describe, it, expect } from "vitest";
import { generateReferralCode, normalizeReferralCode, isValidReferralCode, REFERRAL_CODE_LEN } from "@/lib/referrals";

describe("generateReferralCode", () => {
  it("produces a code of the right length from the safe alphabet", () => {
    const code = generateReferralCode(() => 0); // deterministic → all first letter "A"
    expect(code).toBe("AAAAAA");
    expect(code).toHaveLength(REFERRAL_CODE_LEN);
    expect(isValidReferralCode(code)).toBe(true);
  });
  it("never uses ambiguous chars (0/O/1/I)", () => {
    // sweep the alphabet via rand stepping
    for (let i = 0; i < 32; i++) {
      const c = generateReferralCode(() => i / 32);
      expect(c).not.toMatch(/[01OI]/);
    }
  });
});

describe("normalizeReferralCode", () => {
  it("uppercases, strips junk and clamps length", () => {
    expect(normalizeReferralCode(" ab-cd ef ")).toBe("ABCDEF");
    expect(normalizeReferralCode("abcdefghij")).toBe("ABCDEF");
    expect(normalizeReferralCode("a!b@c#2$3%4")).toBe("ABC234");
  });
});

describe("isValidReferralCode", () => {
  it("accepts exactly 6 safe-alphabet chars, rejects others", () => {
    expect(isValidReferralCode("ABCDEF")).toBe(true);
    expect(isValidReferralCode("ABC234")).toBe(true);
    expect(isValidReferralCode("ABCDE")).toBe(false); // too short
    expect(isValidReferralCode("ABCDE0")).toBe(false); // 0 not in alphabet
    expect(isValidReferralCode("ABCDEi")).toBe(false); // lowercase
  });
});
