// src/lib/site.ts
// Single source of truth for brand identity.
//
// Phase 0 of the multi-tenant SaaS migration: brand values that were hardcoded
// across metadata / manifest / footer / OG image now live here. This is the
// DEFAULT tenant's branding — once tenants exist (see lib/tenant.ts), per-tenant
// values resolved from the request override these at runtime. Keeping a static
// default means the app still renders correctly outside any tenant context
// (build time, root metadata, fallbacks).

export const SITE = {
  /** Display brand, used in titles/headings (matches the on-site uppercase style). */
  name: "GH0ST EMPIRE",
  /** Shorter brand for manifest short_name / OS UI. */
  shortName: "Ghost Empire",
  /** Streamer / owner handle (no leading @). */
  owner: "Gh0s77tt",
  /** Owner handle with @, for the social / Twitter card. */
  ownerHandle: "@Gh0s77tt",
  /** Primary brand accent (hex). */
  brandColor: "#E50914",
  /** Dark background used by the web app manifest. */
  backgroundColor: "#0A0A0A",
  /** Canonical origin, no trailing slash. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://ghost-empire-web.vercel.app",
  /** Copyright year shown in the footer. */
  year: 2026,
  /** SEO keywords for the root metadata. */
  keywords: ["ghost empire", "gh0st", "gh0s77tt", "twitch", "kick", "streaming", "discord", "ghost tokens"],
} as const;
