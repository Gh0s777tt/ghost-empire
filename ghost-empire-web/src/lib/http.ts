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

// ── Defensive JSON parsing of third-party responses ────────────────────────────────────
//
// WHY: `res.json()` on a body that isn't JSON throws the platform's own message —
// `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. That message names neither the
// upstream, nor the status, nor the content-type, so when it surfaces in an alert (it did:
// Sentry GHOST-EMPIRE-WEB-5, the Streamlabs donation cron) nobody can tell WHY money stopped
// flowing. An upstream answering `200 text/html` is the classic signature of an expired /
// revoked OAuth token or a CDN interstitial — a REAL money-in outage that must stay loud, just
// diagnosable. So we never silence it; we only make it say what happened.

/** How much of a non-JSON upstream body is echoed into the error. Enough to identify the page,
 *  short enough not to dump a full HTML document into Sentry. */
const BODY_SNIPPET_CHARS = 200;

/**
 * Parse a third-party API body as JSON, failing with a DIAGNOSABLE message.
 *
 * @param opts.label - Which upstream call this is, e.g. `"Streamlabs donations"` — it leads the error.
 * @param opts.status - HTTP status of the response (context for the reader).
 * @param opts.contentType - Raw `content-type` header, or `null` when absent.
 * @param opts.body - The response body, already read as text.
 * @returns The parsed value.
 * @throws {Error} When the body isn't valid JSON — message names the upstream, status,
 *   content-type and a short body snippet.
 *
 * @remarks
 * Parse FIRST, diagnose second: any body that parses today keeps working byte-for-byte, including
 * upstreams that serve valid JSON under a sloppy `text/plain`. The content-type is only ever used
 * to explain a failure, never to reject a success — this must not change what production accepts.
 */
export function parseJsonBody<T = unknown>(opts: {
  label: string;
  status: number;
  contentType: string | null;
  body: string;
}): T {
  try {
    return JSON.parse(opts.body) as T;
  } catch {
    throw new Error(describeNonJsonBody(opts));
  }
}

/** Build the human-readable diagnosis for a body that failed `JSON.parse`. */
function describeNonJsonBody(opts: {
  label: string;
  status: number;
  contentType: string | null;
  body: string;
}): string {
  const { label, status, body } = opts;
  const contentType = opts.contentType?.split(";")[0]?.trim() || "(none)";
  const head = `${label} returned non-JSON (HTTP ${status}, content-type ${contentType})`;

  if (!body.trim()) return `${head}: empty body`;

  // An HTML body from a JSON API is almost always a login page, a consent/SSO interstitial or a
  // CDN error page — i.e. the request never reached the API. Say so, it's the actionable part.
  const looksHtml = /^\s*(<!doctype|<html)/i.test(body);
  const hint = looksHtml ? " — upstream served an HTML page (login/interstitial/error), not the API" : "";
  return `${head}${hint}: ${body.slice(0, BODY_SNIPPET_CHARS)}`;
}

/**
 * `res.json()` replacement for third-party calls — reads the body once and delegates to
 * {@link parseJsonBody}, so a non-JSON answer produces a diagnosable error instead of
 * `Unexpected token '<'`.
 *
 * @param res - The response to read (its body is consumed).
 * @param label - Which upstream call this is, e.g. `"Streamlabs donations"`.
 */
export async function jsonOrThrow<T = unknown>(res: Response, label: string): Promise<T> {
  return parseJsonBody<T>({
    label,
    status: res.status,
    contentType: res.headers.get("content-type"),
    body: await res.text(),
  });
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
