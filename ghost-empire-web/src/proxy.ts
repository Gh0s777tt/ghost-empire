// src/proxy.ts
// Composes TWO concerns in one Next 16 proxy (ex-"middleware"):
//   1. CSP nonce (XSS hardening) — per-request nonce + 'strict-dynamic' in script-src,
//      dropping 'unsafe-inline'. Next reads the nonce from the request CSP header to
//      stamp its <script> tags; style-src keeps 'unsafe-inline' (inline overlay styles).
//   2. next-intl locale routing — PL unprefixed ("/"), English under "/en".
//
// /overlay/* is EXCLUDED from locale routing (OBS browser-source URLs must stay
// /overlay/*) but STILL gets the CSP nonce. /api/* is excluded from both (JSON/SSE
// execute no scripts → SSE overlay streams untouched).
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18n = createMiddleware(routing);

function buildCsp(nonce: string): string {
  return [
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
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Forward the nonce to the rendered route (Next stamps <script> from the request CSP header).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response: NextResponse;
  if (request.nextUrl.pathname.startsWith("/overlay")) {
    // OBS overlays: CSP only, no locale prefixing.
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    // Localized routes: next-intl handles locale, carrying the nonce'd request headers.
    response = handleI18n(new NextRequest(request, { headers: requestHeaders }));
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // All document routes except API, Next internals and static assets. Skipping
      // prefetch requests keeps a prefetched RSC payload's nonce from going stale.
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
