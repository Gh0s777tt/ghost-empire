// src/lib/http.ts
// Thin `fetch` wrapper that adds a default timeout to outbound calls to third-party
// APIs (Twitch / Kick / YouTube / Streamlabs / Steam …). A hung upstream must never
// pin a serverless function or a DB-pool slot (the pool is only 3) — so every external
// call aborts after `EXTERNAL_TIMEOUT_MS` and rejects (callers already handle failure).
// Pass your own `signal` to override. #audit-v2
export const EXTERNAL_TIMEOUT_MS = 8_000;

export function httpFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
}

// ── Client-IP extraction from proxy headers — one source of truth (previously
//    duplicated across ~13 rate-limit routes plus a richer variant in audit.ts).
//
//    SECURITY (#audit): the LEFT-most `X-Forwarded-For` entry is CLIENT-SUPPLIED and
//    trivially spoofable — behind a proxy the client controls the left of the chain and
//    the proxy appends the real IP on the right. Trusting `xff.split(",")[0]` let a caller
//    send `X-Forwarded-For: 1.2.3.4` and, by rotating it per request, mint unlimited
//    distinct rate-limit buckets — defeating every IP-keyed `rateLimit()` (passkey
//    brute-force caps, pre-auth flood layers, fail-closed cost caps) — and forge or pin on
//    a third party the `ipAddress` we persist in the admin audit log (see audit.ts). So raw
//    XFF is now a LAST resort, and even then we read the RIGHT-most hop (the one appended by
//    the trusted proxy nearest us), never the client-controlled left-most.
//
//    This app deploys on Vercel. Vercel sets `x-real-ip` and `x-vercel-forwarded-for` to the
//    true client IP at its edge, OVERWRITING whatever the client sent (it does not forward
//    external XFF IPs — https://vercel.com/docs/headers/request-headers). `x-real-ip` is
//    exactly the header `@vercel/functions` `ipAddress()` reads, so we prefer these trusted,
//    platform-set, single-value headers first. `cf-connecting-ip` (Cloudflare edge) is kept
//    as a trusted single-value fallback for non-Vercel hosting.
function ipFromHeaders(headers: Headers): string | null {
  // 1) Trusted, platform-set headers first. Vercel overwrites these at its edge, so the
  //    client cannot spoof them; `x-real-ip` mirrors `@vercel/functions` `ipAddress()`.
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const vercel = lastHop(headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  // 2) Cloudflare's trusted client-IP header (single value, set by the CF edge).
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  // 3) Last resort — raw X-Forwarded-For. Take the RIGHT-most hop (appended by the proxy
  //    closest to us), never the spoofable client-supplied left-most.
  return lastHop(headers.get("x-forwarded-for"));
}

/** Right-most non-empty entry of a comma-separated forwarded-for chain — the hop appended
 *  by the trusted proxy nearest the server (the left-most entries are client-controlled and
 *  spoofable). Returns null when the header is absent or has no usable entry. */
function lastHop(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(",");
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]?.trim();
    if (part) return part;
  }
  return null;
}

/** Client IP for rate-limit keys / analytics — never null (falls back to "unknown"). */
export function clientIp(req: { headers: Headers }): string {
  return ipFromHeaders(req.headers) ?? "unknown";
}

/** Client IP for audit logs — null (not "unknown") when it can't be determined, so the
 *  column stays nullable rather than storing a sentinel string. */
export function clientIpOrNull(req: { headers: Headers }): string | null {
  return ipFromHeaders(req.headers);
}
