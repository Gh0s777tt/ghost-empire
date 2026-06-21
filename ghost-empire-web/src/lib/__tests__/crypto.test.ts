import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash, createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { encryptSecret, encryptSecretStrict, decryptSecret, isEncrypted, hmacSign, hmacVerify } from "@/lib/crypto";

const TEST_SECRET = "unit-test-secret-abc";
const legacyKey = () => createHash("sha256").update(TEST_SECRET).digest(); // pre-#644 master key

/** Build a legacy "enc:v1:" blob the way pre-#644 code did (master key directly). */
function makeV1(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", legacyKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "enc:v1:" + Buffer.concat([iv, tag, ct]).toString("base64");
}

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

describe("crypto v2 (HKDF sub-keys) + back-compat (#audit5)", () => {
  beforeEach(() => { vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("writes the v2 envelope and round-trips it", () => {
    const enc = encryptSecret("hello-v2");
    expect(enc?.startsWith("enc:v2:")).toBe(true);
    expect(decryptSecret(enc)).toBe("hello-v2");
  });

  it("still decrypts legacy v1 ciphertext (master-key) after the HKDF switch", () => {
    const v1 = makeV1("legacy-token-xyz");
    expect(isEncrypted(v1)).toBe(true);
    expect(decryptSecret(v1)).toBe("legacy-token-xyz");
  });

  it("encryptSecretStrict round-trips and passes null/empty through", () => {
    const enc = encryptSecretStrict("jan kowalski");
    expect(enc?.startsWith("enc:v2:")).toBe(true);
    expect(decryptSecret(enc)).toBe("jan kowalski");
    expect(encryptSecretStrict(null)).toBeNull();
    expect(encryptSecretStrict("")).toBe("");
  });

  it("the encryption sub-key is NOT the legacy master key (true separation)", () => {
    // A v2 blob must NOT be decryptable with the raw master key (only via the HKDF sub-key).
    const enc = encryptSecret("separation-check")!;
    const raw = Buffer.from(enc.slice("enc:v2:".length), "base64");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    expect(() => {
      const d = createDecipheriv("aes-256-gcm", legacyKey(), iv);
      d.setAuthTag(tag);
      Buffer.concat([d.update(ct), d.final()]);
    }).toThrow(); // master key can't open a v2 (HKDF-enc-key) envelope
  });

  it("hmacVerify accepts the current v2 signature AND a legacy master-key signature", () => {
    const msg = "oauth-state-body";
    expect(hmacVerify(msg, hmacSign(msg))).toBe(true); // current
    const legacySig = createHmac("sha256", legacyKey()).update(msg, "utf8").digest("base64url");
    expect(hmacVerify(msg, legacySig)).toBe(true); // back-compat fallback
    expect(hmacVerify(msg, "tampered")).toBe(false);
  });
});
