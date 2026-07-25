import { describe, it, expect } from "vitest";
import { cryptoRng, randomToken } from "@/lib/secure-rng";

// The CSPRNG source that backs every money-path draw (casino / duels / heists, #777).
describe("cryptoRng", () => {
  it("returns a finite number in [0, 1) across many samples", () => {
    for (let i = 0; i < 5000; i++) {
      const r = cryptoRng();
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

// The mint site for bearer secrets (per-tenant bot secret). A weak or repeated token here
// is an authentication bypass, so the shape guarantees are worth pinning down.
describe("randomToken", () => {
  it("defaults to 32 bytes → a 43-char base64url string", () => {
    const tok = randomToken();
    expect(tok).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is safe to paste into a .env line or a Bearer header", () => {
    // No padding, no +/ — those would need quoting/encoding somewhere down the line.
    for (let i = 0; i < 200; i++) {
      expect(randomToken()).not.toMatch(/[+/=]/);
    }
  });

  it("honours a custom size", () => {
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken(64)).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it("never repeats across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(randomToken());
    expect(seen.size).toBe(2000);
  });

  it("refuses to mint a brute-forceable token", () => {
    expect(() => randomToken(8)).toThrow(RangeError);
    expect(() => randomToken(0)).toThrow(RangeError);
    expect(() => randomToken(-32)).toThrow(RangeError);
    expect(() => randomToken(32.5)).toThrow(RangeError);
  });
});
