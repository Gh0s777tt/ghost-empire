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
import { tenantSlugFromHost, TENANT_HEADER } from "@/lib/tenant-host";

const handleI18n = createMiddleware(routing);

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'inline-speculation-rules' (#775) allows ONLY inline <script type="speculationrules">
    // (the Speculation Rules API JSON — no JS execution), keeping script-src otherwise strict.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'inline-speculation-rules'`,
    // Split style policy (#735): inline <style> ELEMENT blocks were extracted to CSS files
    // (globals.css keyframes + overlay/overlay.css reset) loaded via <link>, so element styles
    // need only 'self'. 'unsafe-inline' is now confined to style-src-ATTR — required because the
    // app has ~638 dynamic inline `style={{}}` attributes (overlay positions/colors, progress bars)
    // whose runtime values are un-hashable and which CSP nonces/hashes CANNOT cover (nonces apply
    // to <style> elements, never to style attributes). CSS injection is low-risk and script-src is
    // already locked (nonce + strict-dynamic, no unsafe-inline/unsafe-eval).
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://id.twitch.tv https://discord.com",
    // 'self' (not 'none') so the admin Payments section can embed its own /support page in a
    // same-origin preview iframe (#702/#728); cross-origin framing (clickjacking) stays blocked.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self' https://id.twitch.tv https://discord.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const isOverlay = request.nextUrl.pathname.startsWith("/overlay");
  // The PWA offline fallback is a top-level route (app/offline), not under [locale].
  // Like overlays it must skip next-intl rewriting (which would send "/offline" to
  // "/pl/offline" and 404), while still receiving the CSP nonce.
  const isOffline = request.nextUrl.pathname === "/offline";

  // Multi-tenant (SaaS): derive the tenant slug from the request subdomain and
  // forward it so server code can resolve it to a tenant. No DB call here — the
  // proxy runs on the edge. No-op until NEXT_PUBLIC_ROOT_DOMAIN is set (→ null).
  const tenantSlug = tenantSlugFromHost(request.headers.get("host"));

  // Prefetch RSC requests (<Link> hover/viewport prefetch) MUST still pass through
  // next-intl locale routing. With localePrefix:"as-needed" the default locale (PL)
  // is unprefixed, so next-intl REWRITES "/shop" → "/[locale]/shop" internally. If a
  // prefetch skips that rewrite, "/shop" resolves to [locale]="shop", fails
  // hasLocale() in [locale]/layout.tsx → notFound() — so the *prefetched* payload is
  // a 404 that flashes on click before the real navigation lands. We just skip the
  // per-request CSP nonce here: a nonce minted now is stale vs. the live document's
  // CSP by the time the prefetched payload is navigated to (so the prefetch response
  // carries no nonce — matching its prior behaviour, minus the 404).
  const isPrefetch =
    request.headers.get("next-router-prefetch") !== null ||
    request.headers.get("purpose") === "prefetch";

  if (isPrefetch) {
    if (isOverlay || isOffline) return NextResponse.next();
    // Strip any client-sent tenant header; only a host-derived slug is trusted.
    const h = new Headers(request.headers);
    h.delete(TENANT_HEADER);
    if (tenantSlug) h.set(TENANT_HEADER, tenantSlug);
    return handleI18n(new NextRequest(request, { headers: h }));
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Forward the nonce to the rendered route (Next stamps <script> from the request CSP header).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  // Never trust a client-sent tenant header: strip it, then set only the host-derived slug.
  requestHeaders.delete(TENANT_HEADER);
  if (tenantSlug) requestHeaders.set(TENANT_HEADER, tenantSlug);

  let response: NextResponse;
  if (isOverlay || isOffline) {
    // OBS overlays + PWA offline page: CSP only, no locale prefixing.
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
    // All document routes except API, Next internals and static assets. Prefetch
    // requests are NOT excluded here — they must run through next-intl for locale
    // rewriting (see the isPrefetch branch above); they just skip the CSP nonce.
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|map|pdf)$).*)",
  ],
};
