// src/app/sitemap.ts
// Generated /sitemap.xml listing public, indexable routes for search engines.
// Auth-gated (/admin, /profile), API and OBS overlay routes are intentionally
// excluded — they carry no SEO value and some require a session.
// Each route lists PL (default, at /) + EN (/en) via hreflang alternates so
// Google serves the right language version (i18n, next-intl `as-needed` prefix).
import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // [path, changeFrequency, priority]
  const routes: Array<[string, MetadataRoute.Sitemap[number]["changeFrequency"], number]> = [
    ["", "daily", 1.0],          // home
    ["/ranking", "hourly", 0.9],
    ["/shop", "daily", 0.9],
    ["/events", "daily", 0.8],
    ["/predictions", "hourly", 0.8],
    ["/drops", "hourly", 0.7],
    ["/quests", "daily", 0.7],
    ["/seasons", "daily", 0.7],
    ["/achievements", "weekly", 0.7],
    ["/schedule", "weekly", 0.6],
    ["/about", "monthly", 0.5],
    ["/terms", "yearly", 0.3],
    ["/privacy", "yearly", 0.3],
  ];

  const urlFor = (loc: string, path: string) =>
    loc === routing.defaultLocale ? `${BASE}${path}` : `${BASE}/${loc}${path}`;

  return routes.map(([path, changeFrequency, priority]) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
    alternates: {
      languages: {
        ...Object.fromEntries(routing.locales.map((loc) => [loc, urlFor(loc, path)])),
        "x-default": `${BASE}${path}`,
      },
    },
  }));
}
