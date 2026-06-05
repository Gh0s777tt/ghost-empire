// src/lib/crypto.ts
// Symmetric encryption for secrets stored at rest (API keys, OAuth tokens). AES-256-GCM.
// The key is derived from ENCRYPTION_KEY (preferred) or NEXTAUTH_SECRET via SHA-256, so it
// works out of the box without a new env var. decryptSecret() is backward-compatible:
// values WITHOUT the "enc:v1:" prefix are treated as legacy plaintext and returned as-is,
// so existing rows keep working and get encrypted on their next write (gradual migration).
//
// ⚠️ The key must stay stable: if ENCRYPTION_KEY / NEXTAUTH_SECRET changes, previously
// encrypted secrets become unreadable (API keys → re-paste in /admin#integrations; OAuth
// tokens → users re-auth). Set a dedicated ENCRYPTION_KEY in prod to decouple from auth.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "ghost-empire-dev-key";
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

/** Encrypt a secret for storage. null/empty pass through unchanged. Never throws. */
export function encryptSecret(plaintext: string): string;
export function encryptSecret(plaintext: null | undefined): null;
export function encryptSecret(plaintext: string | null | undefined): string | null;
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key(), iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
  } catch {
    return plaintext; // never lose data on a crypto failure
  }
}

/** Decrypt a stored secret. Legacy plaintext (no prefix) returns unchanged; bad/wrong-key → null. */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** True when a stored value is already encrypted (has the prefix). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
