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

/** Legacy master key — sha256(secret). Used for v1 decrypt + v1 HMAC fallback + as HKDF input. */
function masterKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "ghost-empire-dev-key";
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
    const cipher = createCipheriv("aes-256-gcm", encKeyV2(), iv);
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

/** Decrypt a stored secret across all generations. Legacy plaintext returns unchanged; a
 *  bad value / wrong key → null. */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  const isV2 = value.startsWith(PREFIX_V2);
  const isV1 = value.startsWith(PREFIX_V1);
  if (!isV2 && !isV1) return value; // legacy plaintext
  try {
    const raw = Buffer.from(value.slice(PREFIX_V2.length), "base64"); // v1/v2 prefixes are same length
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", isV2 ? encKeyV2() : masterKey(), iv);
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
