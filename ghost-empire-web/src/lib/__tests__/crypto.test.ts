import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "@/lib/crypto";

describe("crypto secrets (AES-256-GCM)", () => {
  beforeEach(() => { vi.stubEnv("NEXTAUTH_SECRET", "unit-test-secret-abc"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("round-trips a secret and hides the plaintext", () => {
    const plain = "super-confidential-token-12345";
    const enc = encryptSecret(plain);
    expect(enc).not.toBeNull();
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("confidential");
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("passes legacy plaintext through unchanged (backward compatible)", () => {
    expect(decryptSecret("legacy-plaintext-value")).toBe("legacy-plaintext-value");
    expect(isEncrypted("legacy-plaintext-value")).toBe(false);
  });

  it("handles null / empty", () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
  });

  it("returns null for corrupt/forged ciphertext", () => {
    expect(decryptSecret("enc:v1:bm90LXZhbGlk")).toBeNull();
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same-input")).not.toBe(encryptSecret("same-input"));
  });
});
