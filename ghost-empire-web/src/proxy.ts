// src/proxy.ts
// Per-request CSP nonce so script-src can drop 'unsafe-inline' (XSS hardening).
// (Next 16 renamed the `middleware` file convention to `proxy`.)
//
// Each request gets a fresh nonce injected into the Content-Security-Policy header.
// Next.js reads that nonce from the REQUEST's CSP header and stamps it onto its own
// <script> tags — including the streaming RSC inline scripts and next/script
// (Vercel Analytics / Speed Insights). 'strict-dynamic' then lets those nonce'd
// scripts load the rest of the bundle, so 'self'/host allowlists aren't needed for
// scripts in CSP3 browsers.
//
// style-src KEEPS 'unsafe-inline' on purpose — the overlays/cards render with inline
// `style={{…}}` attributes (and a few <style> tags), which a nonce can't cover.
// CSP is intentionally NOT applied to /api (JSON/SSE responses execute no scripts),
// which also keeps the SSE overlay streams untouched.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Edge-safe nonce (no Node Buffer): base64 of a random UUID.
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://id.twitch.tv https://discord.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://id.twitch.tv https://discord.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Next reads the nonce from the request's CSP header to stamp its <script> tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // All document routes except API, Next internals and static assets. Skipping
      // prefetch requests stops a prefetched RSC payload's nonce going stale vs the
      // real navigation (which would block its scripts).
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
