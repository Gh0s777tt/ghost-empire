import { describe, it, expect } from "vitest";
import { base32Encode, base32Decode, totpCodeAt, verifyTotp, generateTotpSecret, otpauthUri } from "@/lib/totp";

// RFC 4226 Appendix D / RFC 6238 use this 20-byte ASCII seed.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
// RFC 4226 Appendix D: HOTP(counter) → 6-digit. TOTP counter = floor(t/30s).
const RFC_HOTP = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const ascii of ["", "a", "ab", "abc", "abcd", "12345678901234567890", "\x00\xff\x10"]) {
      const buf = Buffer.from(ascii, "binary");
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    }
  });
  it("ignores spaces and case on decode", () => {
    const enc = base32Encode(Buffer.from("hello"));
    expect(base32Decode(enc.toLowerCase().replace(/(.{2})/g, "$1 ")).equals(Buffer.from("hello"))).toBe(true);
  });
});

describe("totpCodeAt — RFC vectors", () => {
  it("matches the RFC 4226/6238 codes per 30s step", () => {
    expect(totpCodeAt(RFC_SECRET, 0)).toBe(RFC_HOTP[0]);        // step 0
    expect(totpCodeAt(RFC_SECRET, 30_000)).toBe(RFC_HOTP[1]);   // step 1
    expect(totpCodeAt(RFC_SECRET, 59_000)).toBe(RFC_HOTP[1]);   // RFC 6238 T=59 → step 1
    expect(totpCodeAt(RFC_SECRET, 60_000)).toBe(RFC_HOTP[2]);   // step 2
    expect(totpCodeAt(RFC_SECRET, 90_000)).toBe(RFC_HOTP[3]);   // step 3
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and rejects a wrong one", () => {
    expect(verifyTotp(RFC_SECRET, RFC_HOTP[2], 60_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, "000000", 60_000)).toBe(false);
  });
  it("tolerates ±1 step of clock drift but not more", () => {
    // At step 2 (t=60s), the step-1 and step-3 codes are within the ±1 window.
    expect(verifyTotp(RFC_SECRET, RFC_HOTP[1], 60_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, RFC_HOTP[3], 60_000)).toBe(true);
    // The step-4 code is two steps away → rejected.
    expect(verifyTotp(RFC_SECRET, RFC_HOTP[4], 60_000)).toBe(false);
  });
  it("rejects malformed input before any crypto", () => {
    expect(verifyTotp(RFC_SECRET, "", 0)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12345", 0)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", 0)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "1234567", 0)).toBe(false);
  });
  it("accepts a code with spaces (as users paste them)", () => {
    expect(verifyTotp(RFC_SECRET, RFC_HOTP[0].replace(/(.{3})/, "$1 "), 0)).toBe(true);
  });
});

describe("generateTotpSecret / otpauthUri", () => {
  it("generates a valid 32-char base32 secret", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/); // 20 bytes → 32 base32 chars
  });
  it("builds a scannable otpauth URI", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "gh0s77tt", "GHOST EMPIRE");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=GHOST+EMPIRE");
  });
});
