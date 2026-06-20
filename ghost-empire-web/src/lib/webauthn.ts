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

/** Resolve { rpID, origin } from a request's host / x-forwarded-proto headers. */
export function webauthnContext(req: Request): { rpID: string; origin: string } {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto");
  return { rpID: rpIdFromHost(host), origin: originFromHeaders(host, proto) };
}

// base64url <-> bytes (re-exported so routes don't reach into the helpers path).
export const b64url = isoBase64URL;
