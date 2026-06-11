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
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { resolveTenantSlug } from "@/lib/tenant-host";

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
};

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
export const getCurrentTenant = cache(async function getCurrentTenant(): Promise<TenantBrand> {
  let slug = DEFAULT_TENANT_SLUG;
  try {
    const h = await headers();
    slug = resolveTenantSlug(h.get("host")) || DEFAULT_TENANT_SLUG;
  } catch {
    // headers() unavailable outside a request scope — keep the default slug.
  }
  try {
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (t) {
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
      };
    }
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
