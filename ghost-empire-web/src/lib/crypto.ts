// src/lib/crypto.ts
// Symmetric encryption for secrets stored at rest (API keys, OAuth tokens, PII). AES-256-GCM.
//
// Key hierarchy (#audit5): a master key is derived from ENCRYPTION_KEY (preferred) or
// NEXTAUTH_SECRET via SHA-256, then HKDF derives INDEPENDENT sub-keys per purpose — a v2
// encryption key and a v2 HMAC key — so no single key is used for two primitives, and knowing
// one sub-key never reveals the master or the other (true key separation).
//
// Backward compatible by design — decryptSecret/hmacVerify read every generation:
//   • "enc:v2:" → HKDF-derived enc key (current writes)
//   • "enc:v1:" → legacy master key (sha256(secret)) — still decrypts pre-#644 ciphertext
//   • no prefix → legacy plaintext, returned as-is (re-encrypted on next write)
// Existing rows keep working; they upgrade to v2 the next time they're written.
//
// ⚠️ The key must stay stable: if ENCRYPTION_KEY / NEXTAUTH_SECRET changes, previously
// encrypted secrets become unreadable (API keys → re-paste in /admin#integrations; OAuth
// tokens → users re-auth). Set a dedicated ENCRYPTION_KEY in prod to decouple from auth.
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

const PREFIX_V1 = "enc:v1:";
const PREFIX_V2 = "enc:v2:";
// HKDF salt is non-secret (domain separation only) — a fixed constant is correct here.
const HKDF_SALT = Buffer.from("ghost-empire/crypto/hkdf/v2");

/**
 * GCM authentication-tag length, in bytes — pinned to the full 16 (128-bit) tag.
 *
 * ⚠️ Money/secret-critical invariant: a GCM tag is truncatable, and a receiver that accepts a
 * SHORT tag is exponentially cheaper to forge against (an 8-byte tag is ~2^64 times weaker than
 * a 16-byte one, and repeated failed forgeries against a truncated tag leak the GHASH
 * authentication key). This module guards `Tenant.botSecret` and `Connection` OAuth tokens, so
 * the tag length is an authentication parameter, not a formatting detail — it is stated
 * explicitly on BOTH ends rather than inherited from a runtime default.
 *
 * This is NOT theoretical on our runtime. Measured on `node:22` — the version prod actually runs
 * (`engines.node >=22`, CI image `node:22-bookworm-slim`) — a decipher built WITHOUT this option
 * happily decrypts a payload carrying a 4-byte tag; Node 26 rejects it. So on Node 22 the
 * truncation the `gcm-no-tag-length` rule warns about was reachable, and pinning the length here
 * is the fix, not a lint appeasement.
 *
 * The envelope layout is unchanged (`iv[12] | tag[16] | ciphertext`) and `getAuthTag()` has always
 * emitted 16 bytes, so every row already in the database keeps decrypting — the v1/v2 round-trip
 * and short-tag-rejected tests in `crypto.test.ts` pin both halves of that.
 */
const GCM_TAG_BYTES = 16;

/** Legacy master key — sha256(secret). Used for v1 decrypt + v1 HMAC fallback + as HKDF input. */
function masterKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // The dev fallback below is a PUBLIC constant — using it in production would make every
    // "encrypted" secret trivially decryptable by anyone. Fail fast rather than silently
    // downgrading at-rest crypto to a known key. #audit-N
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY (or NEXTAUTH_SECRET) must be set in production — refusing to fall back to the public dev key");
    }
    return createHash("sha256").update("ghost-empire-dev-key").digest(); // dev/test only
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

/** Independent 32-byte sub-key for a given purpose, via HKDF over the master key. */
function subKey(info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), HKDF_SALT, info, 32));
}
const encKeyV2 = () => subKey("enc-v2");
const macKeyV2 = () => subKey("mac-v2");

/** Core AES-256-GCM encrypt → "enc:v2:" envelope. `strict` throws instead of failing open. */
function encrypt(plaintext: string | null | undefined, strict: boolean): string | null {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encKeyV2(), iv, { authTagLength: GCM_TAG_BYTES });
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX_V2 + Buffer.concat([iv, tag, ct]).toString("base64");
  } catch (e) {
    // Non-PII secrets prefer availability (fail open); PII MUST fail closed so a misconfigured
    // key can never silently persist e.g. a home address in cleartext (#audit5).
    if (strict) throw e instanceof Error ? e : new Error("encryption failed");
    return plaintext;
  }
}

/** Encrypt a secret for storage. null/empty pass through. Fails OPEN (returns plaintext) on a
 *  crypto error — for non-personal secrets (API keys) where availability is preferred. */
export function encryptSecret(plaintext: string): string;
export function encryptSecret(plaintext: null | undefined): null;
export function encryptSecret(plaintext: string | null | undefined): string | null;
export function encryptSecret(plaintext: string | null | undefined): string | null {
  return encrypt(plaintext, false);
}

/** Fail-CLOSED encryption for PII (shipping details, TOTP secret): on a crypto error it THROWS
 *  rather than storing plaintext, so the write fails loudly instead of leaking PII. #audit5 */
export function encryptSecretStrict(plaintext: string): string;
export function encryptSecretStrict(plaintext: null | undefined): null;
export function encryptSecretStrict(plaintext: string | null | undefined): string | null;
export function encryptSecretStrict(plaintext: string | null | undefined): string | null {
  return encrypt(plaintext, true);
}

/**
 * Decrypt a stored secret across all generations (`enc:v2:`, `enc:v1:`, bare legacy plaintext).
 *
 * @param value - The stored column value, or null/undefined.
 * @returns The plaintext; the input unchanged when it is legacy (unprefixed) plaintext; `null`
 *   when the value is malformed, was encrypted under a different key, or fails authentication.
 *
 * @remarks
 * Authentication is all-or-nothing: the GCM tag must be the full 16 bytes (128 bits). A stored
 * value carrying a TRUNCATED tag is rejected (→ `null`), never decrypted — see the
 * `GCM_TAG_BYTES` constant in this module for why that is enforced explicitly rather than left
 * to the Node default.
 *
 * ⚠️ A `null` return is indistinguishable between "corrupt", "forged" and "wrong key" **by
 * design** — callers must treat it as "secret unavailable" and must not fall back to using
 * `value` as though it were plaintext.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  const isV2 = value.startsWith(PREFIX_V2);
  const isV1 = value.startsWith(PREFIX_V1);
  if (!isV2 && !isV1) return value; // legacy plaintext
  try {
    const raw = Buffer.from(value.slice(PREFIX_V2.length), "base64"); // v1/v2 prefixes are same length
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 12 + GCM_TAG_BYTES);
    const ct = raw.subarray(12 + GCM_TAG_BYTES);
    // authTagLength pins the tag to the full 128 bits: a truncated tag now throws in setAuthTag
    // (→ caught below → null) instead of being accepted as valid on Node 22. See GCM_TAG_BYTES.
    const decipher = createDecipheriv("aes-256-gcm", isV2 ? encKeyV2() : masterKey(), iv, { authTagLength: GCM_TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** True when a stored value is already encrypted (any generation). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && (value.startsWith(PREFIX_V2) || value.startsWith(PREFIX_V1));
}

/** HMAC-SHA256 of a message with the dedicated v2 MAC sub-key (base64url). */
export function hmacSign(message: string): string {
  return createHmac("sha256", macKeyV2()).update(message, "utf8").digest("base64url");
}

function eqB64(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Constant-time verify of hmacSign output. Accepts the current (v2 sub-key) signature and,
 *  for back-compat across the #644 rollout, a legacy master-key signature (e.g. an OAuth
 *  `state` signed just before deploy, ≤10-min TTL). */
export function hmacVerify(message: string, signature: string): boolean {
  try {
    const v2 = createHmac("sha256", macKeyV2()).update(message, "utf8").digest("base64url");
    if (eqB64(v2, signature)) return true;
    const v1 = createHmac("sha256", masterKey()).update(message, "utf8").digest("base64url");
    return eqB64(v1, signature);
  } catch {
    return false;
  }
}
