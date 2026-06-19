// src/lib/totp.ts
// RFC 6238 TOTP (and the RFC 4226 HOTP it builds on) for admin step-up auth.
// SHA-1, 30s period, 6 digits — the defaults every authenticator app expects.
// Hand-rolled on node:crypto (no dependency); verified against the published
// RFC test vectors in __tests__/totp.test.ts. The secret is base32 (RFC 4648);
// callers encrypt it at rest with lib/crypto before persisting.
import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD = 30; // seconds
const DIGITS = 6;

/** A fresh 160-bit secret, base32-encoded (the size RFC 4226 recommends). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4648 base32 (no padding, uppercase). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1; // keep only the leftover bits → never overflows 32-bit
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Inverse of base32Encode. Ignores spaces/padding and case; skips stray chars. */
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP for a given counter. */
function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** The TOTP code for a base32 secret at a given wall-clock time (ms). */
export function totpCodeAt(secretB32: string, timeMs: number): string {
  return hotp(base32Decode(secretB32), Math.floor(timeMs / 1000 / PERIOD));
}

/**
 * Verify a user-entered code, allowing ±`window` steps of clock drift (default
 * ±1 step = ±30s, the standard tolerance). Whitespace is stripped; non-6-digit
 * input is rejected before any crypto.
 */
export function verifyTotp(secretB32: string, code: string, timeMs: number, window = 1): boolean {
  const clean = (code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secretB32);
  const counter = Math.floor(timeMs / 1000 / PERIOD);
  for (let i = -window; i <= window; i++) {
    const c = counter + i;
    if (c < 0) continue; // no valid TOTP has a pre-epoch counter
    if (hotp(key, c) === clean) return true;
  }
  return false;
}

/** otpauth:// URI for QR / manual entry in an authenticator app. */
export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Group a secret into 4-char blocks for readable manual entry. */
export function formatSecret(secretB32: string): string {
  return secretB32.replace(/(.{4})/g, "$1 ").trim();
}
