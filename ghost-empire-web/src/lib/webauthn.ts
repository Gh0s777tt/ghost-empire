// src/lib/webauthn.ts
// Shared WebAuthn/passkey helpers (#543). The RP ID and origin are derived from the
// request host so a passkey is bound to the exact host it was registered on (works
// for the vercel.app host today; a root-domain RP ID for subdomains is a future
// tweak). Pure host/origin helpers are unit-tested.
import { isoBase64URL } from "@simplewebauthn/server/helpers";

export const RP_NAME = "GH0ST EMPIRE";
export const REG_CHALLENGE_COOKIE = "pk_reg_chal";
export const AUTH_CHALLENGE_COOKIE = "pk_auth_chal";

/** Hostname only (port stripped) — the WebAuthn Relying Party ID. */
export function rpIdFromHost(host: string | null | undefined): string {
  if (!host) return "localhost";
  return host.split(":")[0];
}

/** Full origin the browser used (scheme + host[:port]); localhost defaults to http. */
export function originFromHeaders(host: string | null | undefined, proto: string | null | undefined): string {
  const h = host || "localhost:3000";
  const p = proto || (h.startsWith("localhost") || h.startsWith("127.0.0.1") ? "http" : "https");
  return `${p}://${h}`;
}

/**
 * Resolve { rpID, origin } for the ceremony. Pinned to the configured canonical URL
 * (`AUTH_URL`/`NEXTAUTH_URL`) — the SAME signal NextAuth derives its cookie + origin
 * from — so (a) the RP ID / origin can't be steered by a spoofed Host/X-Forwarded
 * header (CWE-290), and (b) a session minted on passkey login uses the exact cookie
 * name/`secure` NextAuth reads. Falls back to request headers only when no env URL is
 * set (dev). NOTE: a single canonical host today; per-tenant subdomains would need an
 * allowlist of expected RP IDs.
 */
export function webauthnContext(req: Request): { rpID: string; origin: string } {
  const envUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      return { rpID: u.hostname, origin: u.origin };
    } catch {
      /* malformed env URL → fall back to headers */
    }
  }
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto");
  return { rpID: rpIdFromHost(host), origin: originFromHeaders(host, proto) };
}

/** Whether the session cookie should be `secure` + `__Secure-` prefixed (https origin). */
export function isSecureContext(origin: string): boolean {
  return origin.startsWith("https://");
}

/** Known WebAuthn transports — anything else from the client is dropped before storing. */
const KNOWN_TRANSPORTS = new Set(["usb", "nfc", "ble", "internal", "hybrid", "smart-card", "cable"]);
export function sanitizeTransports(transports: unknown): string | null {
  if (!Array.isArray(transports)) return null;
  const clean = transports.filter((t): t is string => typeof t === "string" && KNOWN_TRANSPORTS.has(t));
  return clean.length ? clean.join(",") : null;
}

// base64url <-> bytes (re-exported so routes don't reach into the helpers path).
export const b64url = isoBase64URL;
