// src/app/robots.ts
// Generated /robots.txt. Allows crawling of public pages; blocks private/admin,
// API, OBS overlays and auth flows (no SEO value, shouldn't appear in search).
import type { MetadataRoute } from "next";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/overlay", "/profile", "/auth/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
