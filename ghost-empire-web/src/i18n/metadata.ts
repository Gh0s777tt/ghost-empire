// src/i18n/metadata.ts
// Per-page hreflang + self-canonical alternates so search engines serve the right
// language version of each public page. PL is unprefixed ("/path"), EN lives under
// "/en/path" (next-intl `as-needed`). Mirrors the per-route alternates in
// app/sitemap.ts — keep the two in sync. Pass the locale-agnostic PL path:
// "" for home, "/shop", `/u/${username}`, etc.
import type { Metadata } from "next";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export function localeAlternates(path: string, locale: string): Metadata["alternates"] {
  const pl = `${BASE}${path}`;
  const en = `${BASE}/en${path}`;
  return {
    // Self-referencing canonical (each language version points to itself).
    canonical: locale === "en" ? en : pl,
    languages: { pl, en, "x-default": pl },
  };
}
