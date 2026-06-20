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
