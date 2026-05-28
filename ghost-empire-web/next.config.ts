import type { NextConfig } from "next";

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
  // Light CSP — does not block inline styles/scripts (Next.js uses them);
  // restricts where iframes/objects can load from. Tighter CSP would need
  // Next.js nonces (more work) — deferred to Phase 2.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://id.twitch.tv https://discord.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://id.twitch.tv https://discord.com",
    ].join("; "),
  },
];

// API-specific headers (no cache, no indexing)
const apiHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // Don't leak "X-Powered-By: Next.js"
  reactStrictMode: true,

  images: {
    domains: [
      "static-cdn.jtvnw.net",      // Twitch avatars
      "api.dicebear.com",           // Fallback avatars
      "cdn.discordapp.com",         // Discord avatars
      "yt3.googleusercontent.com",  // YouTube avatars
      "res.cloudinary.com",         // Cloudinary (shop images, future)
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
    ];
  },
};

export default nextConfig;
