import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash, createCipheriv, createDecipheriv, createHmac, randomBytes, hkdfSync } from "node:crypto";
import { encryptSecret, encryptSecretStrict, decryptSecret, isEncrypted, hmacSign, hmacVerify } from "@/lib/crypto";

const TEST_SECRET = "unit-test-secret-abc";
const legacyKey = () => createHash("sha256").update(TEST_SECRET).digest(); // pre-#644 master key
/** The v2 HKDF encryption sub-key, derived exactly as `crypto.ts` does. */
const encKeyV2 = () =>
  Buffer.from(hkdfSync("sha256", legacyKey(), Buffer.from("ghost-empire/crypto/hkdf/v2"), "enc-v2", 32));

/**
 * Build a stored blob the way the PRE-`authTagLength` writer did — `createCipheriv` with no
 * options object. Deliberately left optionless: these helpers exist to reproduce bytes that are
 * already sitting in the production database, so pinning the tag length here would defeat the
 * purpose of the back-compat tests below. (`gcm-no-tag-length` only flags the decrypt side.)
 */
function makeLegacyBlob(prefix: "enc:v1:" | "enc:v2:", plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", prefix === "enc:v1:" ? legacyKey() : encKeyV2(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return prefix + Buffer.concat([iv, tag, ct]).toString("base64");
}
const makeV1 = (plaintext: string) => makeLegacyBlob("enc:v1:", plaintext);

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
      const d = createDecipheriv("aes-256-gcm", legacyKey(), iv, { authTagLength: 16 });
      d.setAuthTag(tag);
      Buffer.concat([d.update(ct), d.final()]);
    }).toThrow(); // master key can't open a v2 (HKDF-enc-key) envelope
  });

  it("writes a full 16-byte (128-bit) auth tag", () => {
    // The envelope is iv[12] | tag[16] | ct — decryptSecret slices the tag at a fixed offset, so a
    // writer emitting a shorter tag would silently shift the ciphertext. Pin the layout.
    const enc = encryptSecret("tag-length-check")!;
    const raw = Buffer.from(enc.slice("enc:v2:".length), "base64");
    expect(raw.length).toBe(12 + 16 + Buffer.byteLength("tag-length-check", "utf8"));
  });

  it("hmacVerify accepts the current v2 signature AND a legacy master-key signature", () => {
    const msg = "oauth-state-body";
    expect(hmacVerify(msg, hmacSign(msg))).toBe(true); // current
    const legacySig = createHmac("sha256", legacyKey()).update(msg, "utf8").digest("base64url");
    expect(hmacVerify(msg, legacySig)).toBe(true); // back-compat fallback
    expect(hmacVerify(msg, "tampered")).toBe(false);
  });
});

/**
 * GCM auth-tag length is pinned to the full 128 bits (semgrep `gcm-no-tag-length`).
 *
 * Why this matters concretely: on **Node 22** — the version prod runs (`engines.node >=22`, CI
 * image `node:22-bookworm-slim`) — a decipher created WITHOUT `authTagLength` accepts a TRUNCATED
 * tag (measured: a 4-byte tag decrypts cleanly). Node 26 rejects it, so a Node-26-only check would
 * have called this a false positive. The tests below therefore assert the guarantee on BOTH sides:
 * short tags are refused, and the bytes already in the database still decrypt.
 */
describe("crypto GCM auth-tag length is pinned to 16 bytes", () => {
  beforeEach(() => { vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET); });
  afterEach(() => { vi.unstubAllEnvs(); });

  /**
   * Forge a WELL-FORMED short-tag envelope: a genuine GCM tag of `tagBytes` under the real v2
   * sub-key, over empty plaintext. Empty ciphertext is what makes the attack reachable — the
   * envelope is then only `12 + tagBytes` long, so `decryptSecret`'s fixed `subarray(12, 28)`
   * slice yields a SHORT tag rather than borrowing ciphertext bytes to pad it back to 16.
   */
  function forgeShortTagBlob(tagBytes: number): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encKeyV2(), iv, { authTagLength: tagBytes });
    const ct = Buffer.concat([cipher.update(Buffer.alloc(0)), cipher.final()]); // empty
    return "enc:v2:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
  }

  it.each([4, 8, 12, 13, 14, 15])("REJECTS a well-formed %i-byte-tag envelope", (tagBytes) => {
    // Measured against the pre-fix reader on Node 22 (prod): the 4-byte case authenticated and
    // returned "" — a forged value accepted as a valid decrypt. It must now be null.
    expect(decryptSecret(forgeShortTagBlob(tagBytes))).toBeNull();
  });

  it("REJECTS a tag-truncated copy of a real secret", () => {
    // Same attack against a non-empty ciphertext: the byte shift alone already breaks auth, but
    // assert it explicitly so no future refactor of the offsets can leak plaintext.
    const plain = "truncation-must-not-open-this";
    const enc = encryptSecret(plain)!;
    const raw = Buffer.from(enc.slice("enc:v2:".length), "base64");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const forged = "enc:v2:" + Buffer.concat([iv, tag.subarray(0, 8), ct]).toString("base64");
    expect(decryptSecret(forged)).toBeNull();
    expect(decryptSecret(forged)).not.toBe(plain);
  });

  it("the decipher itself refuses a short tag (this is what Node 22 accepted before the fix)", () => {
    // Direct primitive-level assertion: WITHOUT { authTagLength: 16 } this same call decrypts
    // successfully on Node 22. It is the regression guard for the actual vulnerable line.
    const enc = encryptSecret("primitive-level-check")!;
    const raw = Buffer.from(enc.slice("enc:v2:".length), "base64");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);

    expect(() => {
      const d = createDecipheriv("aes-256-gcm", encKeyV2(), iv, { authTagLength: 16 });
      d.setAuthTag(tag.subarray(0, 8)); // half-length tag
      Buffer.concat([d.update(ct), d.final()]);
    }).toThrow(/authentication tag length/i);

    // …and the full-length tag still opens it through the very same construction.
    const ok = createDecipheriv("aes-256-gcm", encKeyV2(), iv, { authTagLength: 16 });
    ok.setAuthTag(tag);
    expect(Buffer.concat([ok.update(ct), ok.final()]).toString("utf8")).toBe("primitive-level-check");
  });

  it("still decrypts rows written by the PRE-fix writer — v1 and v2 (no data migration needed)", () => {
    // The production DB is full of blobs produced by createCipheriv WITHOUT authTagLength.
    // getAuthTag() always emitted 16 bytes, so the envelope is byte-identical and must round-trip.
    const v1 = makeLegacyBlob("enc:v1:", "pre-fix-v1-token");
    const v2 = makeLegacyBlob("enc:v2:", "pre-fix-v2-token");
    expect(decryptSecret(v1)).toBe("pre-fix-v1-token");
    expect(decryptSecret(v2)).toBe("pre-fix-v2-token");
  });

  it("new ciphertext is byte-compatible with the legacy envelope layout", () => {
    // Same three-field layout, same offsets — a row written today is readable by the old reader too,
    // so a rollback of this commit cannot strand freshly written secrets.
    const enc = encryptSecret("layout-compat")!;
    const raw = Buffer.from(enc.slice("enc:v2:".length), "base64");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const legacyReader = createDecipheriv("aes-256-gcm", encKeyV2(), iv, { authTagLength: 16 });
    legacyReader.setAuthTag(tag);
    expect(Buffer.concat([legacyReader.update(ct), legacyReader.final()]).toString("utf8")).toBe("layout-compat");
  });
});
