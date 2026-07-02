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

// ── Client-IP extraction from proxy headers — previously duplicated across ~13 routes
//    (rate-limit keys) plus a richer variant in audit.ts. One source of truth now. Vercel
//    and most proxies set x-forwarded-for (the LEFT-most entry is the original client); we
//    also honor x-real-ip and cf-connecting-ip as fallbacks.
function ipFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
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
