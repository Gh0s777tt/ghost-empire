// src/lib/oauth-state.ts
// Signed OAuth `state` for the streamer-connect flows (Twitch/Kick/YouTube/
// Streamlabs). All tenants share ONE OAuth app per platform, so the callback
// returns to a single global redirect_uri — the Host can't identify the tenant
// there. Instead the state itself carries {tenantId, userId} under an HMAC, so
// the callback knows which tenant initiated the flow and who to audit, even
// when (future subdomains) the admin's session cookie doesn't reach the
// callback host. The random nonce doubles as the CSRF value mirrored in the
// flow cookie, exactly like the previous plain-random state.
import { randomBytes } from "node:crypto";
import { hmacSign, hmacVerify } from "@/lib/crypto";

const VERSION = "v1";
const MAX_AGE_MS = 10 * 60 * 1000; // authorize → callback round trip

export type OAuthStatePayload = {
  /** Tenant that initiated the connect flow (null = legacy single-tenant). */
  tenantId: string | null;
  /** Admin user who initiated it (for connectedById / audit). */
  userId: string;
  /** Which flow this state belongs to — a twitch state can't be replayed on kick. */
  provider: string;
  /** Random per-flow value; also stored in the flow cookie for CSRF matching. */
  nonce: string;
  issuedAt: number;
};

function encode(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Create a signed state. Returns the state string and its nonce (for the cookie). */
export function signOAuthState(input: { tenantId: string | null; userId: string; provider: string }): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload: OAuthStatePayload = { ...input, nonce, issuedAt: Date.now() };
  const body = encode(payload);
  return { state: `${VERSION}.${body}.${hmacSign(`${VERSION}.${body}`)}`, nonce };
}

/** Verify a state string for the given provider. Returns the payload or null. */
export function verifyOAuthState(state: string | null | undefined, provider: string): OAuthStatePayload | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  if (!hmacVerify(`${parts[0]}.${parts[1]}`, parts[2])) return null;
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (payload.provider !== provider) return null;
  if (typeof payload.issuedAt !== "number" || Date.now() - payload.issuedAt > MAX_AGE_MS) return null;
  if (typeof payload.userId !== "string" || !payload.userId) return null;
  return payload;
}
