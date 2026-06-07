// src/lib/tenant.ts
// Tenant resolution for the multi-tenant SaaS.
//
// Phase 1 scaffold: there is exactly one tenant — the default "Ghost Empire"
// tenant created by scripts/backfill-tenant.ts. Until Phase 2 wires
// subdomain-based resolution into the proxy/middleware, callers get that single
// tenant's brand (falling back to SITE before the row/table exists). Keeping the
// seam here means Phase 2 only changes HOW the tenant is chosen, not the callers.
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { resolveTenantSlug, TENANT_HEADER } from "@/lib/tenant-host";

/** Slug (and future subdomain) of the original single-streamer tenant. */
export const DEFAULT_TENANT_SLUG = "ghost-empire";

export type TenantBrand = {
  /** Tenant row id, or null when falling back to SITE (no row yet). */
  id: string | null;
  slug: string;
  name: string;
  shortName: string;
  brandColor: string;
};

/** Brand used before a tenant row exists or outside any request context. */
export const FALLBACK_TENANT: TenantBrand = {
  id: null,
  slug: DEFAULT_TENANT_SLUG,
  name: SITE.name,
  shortName: SITE.shortName,
  brandColor: SITE.brandColor,
};

/**
 * Resolve the active tenant's brand for the current request. Reads the tenant slug
 * from the proxy-set `x-tenant-slug` header (page routes) or, when absent, parses it
 * from the request Host — `/api/*` routes bypass the proxy, so overlay-data and bot
 * endpoints rely on the Host fallback. Falls back to the default tenant when there's
 * no subdomain. Looks the slug up in the DB; before the table exists, or outside a
 * request scope, returns the SITE-derived fallback.
 */
export async function getCurrentTenant(): Promise<TenantBrand> {
  let slug = DEFAULT_TENANT_SLUG;
  try {
    const h = await headers();
    slug = resolveTenantSlug(h.get(TENANT_HEADER), h.get("host")) || DEFAULT_TENANT_SLUG;
  } catch {
    // headers() unavailable outside a request scope — keep the default slug.
  }
  try {
    const t = await prisma.tenant.findUnique({ where: { slug } });
    if (t) {
      return { id: t.id, slug: t.slug, name: t.name, shortName: t.shortName ?? t.name, brandColor: t.brandColor };
    }
  } catch {
    // Tenant table not migrated yet (before `prisma db push`) — fall back gracefully.
  }
  return FALLBACK_TENANT;
}
