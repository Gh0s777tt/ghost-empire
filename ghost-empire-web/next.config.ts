import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// Wraps the config so `ANALYZE=true next build` (npm run analyze) emits an
// interactive treemap of each route's bundle to .next/analyze/*.html. No-op
// (passthrough) on normal builds, so production is unaffected.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// Security headers applied to ALL routes
const securityHeaders = [
  // Force HTTPS for 2 years; tells the browser "never use http for this domain again"
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Block <iframe> embedding (clickjacking protection)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stop browsers from guessing content-type (XSS via mislabeled files)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the URL when navigating to external sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful APIs we don't use
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Isolate our browsing context from cross-origin openers (tabnabbing / XS-Leaks
  // protection). "allow-popups" keeps any OAuth/popup windows we open functional.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Stop legacy Flash/Acrobat from loading cross-domain policy files.
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Light CSP — keeps inline STYLE attributes working (overlays/cards rely on them)
  // and blocks plugins (object-src) + upgrades http subresources to https.
  // `'unsafe-eval'` dropped from script-src: production React/Next don't eval, so
  // this closes a common XSS sink with no functional change (verified via E2E that
  // exercises client-side rendering). Removing the remaining `'unsafe-inline'` from
  // script-src needs nonce middleware — deferred to a dedicated, browser-tested pass.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://id.twitch.tv https://discord.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://id.twitch.tv https://discord.com",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

// API-specific headers (no cache, no indexing)
const apiHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

// Overlay-specific headers. Overlays are token-gated OBS browser sources — they
// should never be indexed by search engines (the token sits in the URL) and the
// HTML shell shouldn't be cached by shared proxies. OBS loads them as a top-level
// document, so the global frame-ancestors 'none' doesn't affect rendering there.
const overlayHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // Don't leak "X-Powered-By: Next.js"
  reactStrictMode: true,

  images: {
    // remotePatterns replaces the deprecated `images.domains` (removed in a future
    // Next major). Pin protocol to https so we never proxy plaintext-http images.
    remotePatterns: [
      { protocol: "https", hostname: "static-cdn.jtvnw.net" },   // Twitch avatars
      { protocol: "https", hostname: "api.dicebear.com" },        // Fallback avatars
      { protocol: "https", hostname: "cdn.discordapp.com" },      // Discord avatars
      { protocol: "https", hostname: "yt3.googleusercontent.com" }, // YouTube avatars
      { protocol: "https", hostname: "res.cloudinary.com" },      // Cloudinary (shop images, future)
      { protocol: "https", hostname: "files.kick.com" },          // Kick avatars
    ],
  },

  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "ghost-empire-web.vercel.app",
      ],
    },
    // Client-side Router Cache: reuse the RSC payload when navigating BACK to a
    // page within this window instead of refetching from the server. Default for
    // dynamic pages is 0s (refetch every navigation) — that's why admin <-> profile
    // <-> achievements back-and-forth felt slow. 30s = instant back-nav, data at
    // most 30s stale (fine for these pages).
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // Trim client JS for the icon-heavy admin/profile pages.
    optimizePackageImports: ["lucide-react"],
  },

  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/(.*)", headers: apiHeaders },
      { source: "/overlay/(.*)", headers: overlayHeaders },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
