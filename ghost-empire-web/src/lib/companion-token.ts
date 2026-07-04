// src/lib/companion-token.ts
// Stateless bearer token for the NX Companion browser extension. The extension
// can't send the SameSite=Lax session cookie on a cross-origin fetch (viewer is
// on twitch.tv, the portal API is on another origin), so it authenticates with a
// short-lived token instead. The token is HMAC-signed (same key as OAuth state /
// crypto.ts) and carries {userId, tenantId} — NO DB row, so no migration and no
// server-side session store. Minted by POST /api/companion/token (session-authed,
// same-origin) and verified on read endpoints. Short TTL bounds the no-revocation
// window; the extension re-mints when it expires.
import { hmacSign, hmacVerify } from "@/lib/crypto";

const VERSION = "cmp1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CompanionTokenPayload {
  userId: string;
  /** Portal the token is scoped to (null = legacy single-tenant). */
  tenantId: string | null;
  issuedAt: number;
}

function encode(p: CompanionTokenPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

/** Mint a signed companion token for a user within a tenant. */
export function signCompanionToken(userId: string, tenantId: string | null): string {
  const body = encode({ userId, tenantId, issuedAt: Date.now() });
  return `${VERSION}.${body}.${hmacSign(`${VERSION}.${body}`)}`;
}

/** Verify a token; returns the payload or null (bad signature / malformed / expired). */
export function verifyCompanionToken(
  token: string | null | undefined,
  now: number = Date.now(),
): CompanionTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  if (!hmacVerify(`${parts[0]}.${parts[1]}`, parts[2])) return null;
  let payload: CompanionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as CompanionTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.userId !== "string" ||
    !(typeof payload.tenantId === "string" || payload.tenantId === null) ||
    typeof payload.issuedAt !== "number"
  ) {
    return null;
  }
  if (now - payload.issuedAt > MAX_AGE_MS || payload.issuedAt > now + 60_000) return null;
  return payload;
}

/** Extract a companion token from an Authorization: Bearer header. */
export function bearerFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1] ?? null;
}
