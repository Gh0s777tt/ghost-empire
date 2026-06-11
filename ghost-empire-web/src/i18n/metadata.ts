// src/i18n/metadata.ts
// Per-page hreflang + self-canonical alternates so search engines serve the right
// language version of each public page. PL is unprefixed ("/path"), EN lives under
// "/en/path" (next-intl `as-needed`). Mirrors the per-route alternates in
// app/sitemap.ts — keep the two in sync. Pass the locale-agnostic PL path:
// "" for home, "/shop", `/u/${username}`, etc.
import type { Metadata } from "next";
import { routing } from "./routing";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export function localeAlternates(path: string, locale: string): Metadata["alternates"] {
  // PL (default) is unprefixed; every other locale lives under "/<locale><path>".
  // For the home page (path "") the default-locale URL needs the trailing slash —
  // browsers normalize the document URL to "<origin>/", and a canonical without
  // the slash reads as a different location (Lighthouse `canonical` failure).
  const urlFor = (loc: string) =>
    loc === routing.defaultLocale ? `${BASE}${path || "/"}` : `${BASE}/${loc}${path}`;
  return {
    // Self-referencing canonical (each language version points to itself).
    canonical: urlFor(locale),
    languages: {
      ...Object.fromEntries(routing.locales.map((loc) => [loc, urlFor(loc)])),
      "x-default": `${BASE}${path || "/"}`,
    },
  };
}
