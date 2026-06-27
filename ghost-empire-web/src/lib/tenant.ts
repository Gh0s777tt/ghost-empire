// src/lib/tenant.ts
// Tenant resolution for the multi-tenant SaaS.
//
// Phase 1 scaffold: there is exactly one tenant — the default "Ghost Empire"
// tenant created by scripts/backfill-tenant.ts. Until Phase 2 wires
// subdomain-based resolution into the proxy/middleware, callers get that single
// tenant's brand (falling back to SITE before the row/table exists). Keeping the
// seam here means Phase 2 only changes HOW the tenant is chosen, not the callers.
import { cache } from "react";
import { headers } from "next/headers";
import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { resolveTenantSlug, customDomainFromHost } from "@/lib/tenant-host";
import { safeMediaUrl } from "@/lib/url-safe";
import { resolveBgPresetCss } from "@/lib/bg-presets";

/** Slug (and future subdomain) of the original single-streamer tenant. */
export const DEFAULT_TENANT_SLUG = "ghost-empire";

export type TenantBrand = {
  /** Tenant row id, or null when falling back to SITE (no row yet). */
  id: string | null;
  slug: string;
  name: string;
  shortName: string;
  brandColor: string;
  /** White-label currency naming (Phase 5) — replaces %tokenName%/%gt% in i18n. */
  tokenName: string;
  tokenSymbol: string;
  /** Streamer's public handle (no leading @) — replaces %owner% in i18n. */
  ownerHandle: string;
  /** Tenant logo (header/footer mark); null = default skull. */
  logoUrl: string | null;
  /** Default name a new Ghost Companion starts with on this portal (#audit3). */
  companionDefaultName: string;
  /** Optional portal background image (rendered behind a dark overlay); null = none. */
  bgImageUrl: string | null;
  /** Resolved CSS background-image of a chosen built-in preset template; null = none (#audit3). */
  bgPreset: string | null;
  /** Portal's own social links; null = fall back to the founder default (SOCIALS). */
  socialLinks: { platform: string; url: string }[] | null;
  /** IANA timezone the /schedule times are shown in (#audit5); defaults to Europe/Warsaw. */
  timezone: string;
};

/** Safely parse the Tenant.socialLinks JSON into a validated list (defensive on read). */
function parseTenantSocials(raw: unknown): { platform: string; url: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter(
      (x): x is { platform: string; url: string } =>
        !!x && typeof x === "object" && typeof (x as { platform?: unknown }).platform === "string" && typeof (x as { url?: unknown }).url === "string",
    )
    .map((x) => ({ platform: x.platform.toLowerCase().slice(0, 20), url: x.url }))
    .filter((x) => /^https?:\/\//i.test(x.url))
    .slice(0, 12);
  return out.length ? out : null;
}

/** Brand used before a tenant row exists or outside any request context. */
export const FALLBACK_TENANT: TenantBrand = {
  id: null,
  slug: DEFAULT_TENANT_SLUG,
  name: SITE.name,
  shortName: SITE.shortName,
  brandColor: SITE.brandColor,
  tokenName: "Ghost Tokens",
  tokenSymbol: "GT",
  ownerHandle: SITE.owner,
  logoUrl: null,
  companionDefaultName: "Widmo",
  bgImageUrl: null,
  bgPreset: null,
  socialLinks: null,
  timezone: "Europe/Warsaw",
};

/**
 * Resolve the active tenant's brand for the current request. Derives the tenant slug
 * from the request Host (subdomain) — never from the forgeable `x-tenant-slug` header
 * (see resolveTenantSlug). Falls back to the default tenant when there's no subdomain.
 * Looks the slug up in the DB; before the table exists, or outside a request scope,
 * returns the SITE-derived fallback.
 *
 * Wrapped in React `cache()` so the ~6 calls per page render (root layout
 * metadata+viewport, [locale] layout, i18n request config, SiteFooter, the page
 * itself) collapse to ONE `tenant.findUnique` per request. Per-request only —
 * no cross-request TTL, so an owner's branding edit still shows instantly.
 */
/** Map a Tenant row to the request-facing brand (shared by every resolution path). */
function toBrand(t: Tenant): TenantBrand {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    shortName: t.shortName ?? t.name,
    brandColor: t.brandColor,
    tokenName: t.tokenName,
    tokenSymbol: t.tokenSymbol,
    ownerHandle: t.ownerHandle ?? t.shortName ?? t.name,
    logoUrl: t.logoUrl,
    companionDefaultName: t.companionDefaultName ?? "Widmo",
    // bgImageUrl holds EITHER a "preset:<id>" template (→ resolved to a gradient) or a
    // real image URL. Resolve the preset first; otherwise re-sanitize the URL on read
    // (it goes into a CSS url(), so be defensive even though the write path also guards).
    bgPreset: resolveBgPresetCss(t.bgImageUrl),
    bgImageUrl: resolveBgPresetCss(t.bgImageUrl) ? null : t.bgImageUrl ? safeMediaUrl(t.bgImageUrl) : null,
    socialLinks: parseTenantSocials(t.socialLinks),
    timezone: t.timezone ?? "Europe/Warsaw",
  };
}

export const getCurrentTenant = cache(async function getCurrentTenant(): Promise<TenantBrand> {
  let host: string | null = null;
  let subSlug: string | null = null;
  try {
    const h = await headers();
    host = h.get("host");
    subSlug = resolveTenantSlug(host); // null for apex / www / when no root domain is configured
  } catch {
    // headers() unavailable outside a request scope — fall through to the default tenant.
  }
  try {
    // 1) A real tenant subdomain (<slug>.<root>) resolves by slug.
    // 2) Otherwise (apex / www / a fully custom domain like empire-forge.com) a tenant whose
    //    `domain` matches the request host wins over the default (#653 — white-label apex).
    // 3) Otherwise the default (founder) tenant.
    let t: Tenant | null = null;
    if (subSlug) {
      t = await prisma.tenant.findUnique({ where: { slug: subSlug } });
    } else {
      const domain = customDomainFromHost(host);
      if (domain) t = await prisma.tenant.findUnique({ where: { domain } });
    }
    if (!t) t = await prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG } });
    if (t) return toBrand(t);
  } catch {
    // Tenant table not migrated yet (before `prisma db push`) — fall back gracefully.
  }
  return FALLBACK_TENANT;
});

/**
 * Convenience: the active tenant's row id, or null before the tenant row exists
 * (pre-backfill) / outside a request scope. This is the value to scope data by —
 * callers use it directly in a `where`/`data` (the explicit `...(tid ? {tenantId:tid} : {})`
 * pattern). A null id means "fall back to legacy/unscoped".
 */
export async function currentTenantId(): Promise<string | null> {
  return (await getCurrentTenant()).id;
}

/**
 * Is this the founder/default portal? Only here are the hardcoded founder defaults
 * (SOCIALS channel links, etc.) the CORRECT thing to show — a sub-tenant with nothing
 * configured must show nothing, never the founder's. `id === null` is the pre-row fallback.
 */
export function isFounderBrand(t: { id: string | null; slug: string }): boolean {
  return t.id === null || t.slug === DEFAULT_TENANT_SLUG;
}
