// src/lib/tenant-host.ts
// Pure host -> tenant-slug parsing, safe to import from the edge proxy (NO prisma,
// no Node APIs). Phase 2 of the SaaS migration: the proxy extracts the tenant slug
// from the request subdomain and forwards it as a header; server code (lib/tenant.ts)
// resolves that slug to a tenant. Kept separate from lib/tenant.ts precisely so the
// edge bundle never pulls in the Prisma client.

/** Request header the proxy uses to forward the resolved tenant slug to the app. */
export const TENANT_HEADER = "x-tenant-slug";

/**
 * Extract the tenant slug from a request host, relative to the configured root
 * domain (NEXT_PUBLIC_ROOT_DOMAIN, e.g. "myapp.com"). Returns null when there is no
 * tenant subdomain — apex, `www`, a non-matching host (localhost / Vercel preview /
 * custom domain), or when no root domain is configured yet. The last case makes this
 * a deliberate no-op until subdomains are actually deployed.
 */
export function tenantSlugFromHost(
  host: string | null | undefined,
  rootDomain: string | undefined = process.env.NEXT_PUBLIC_ROOT_DOMAIN,
): string | null {
  if (!host || !rootDomain) return null;
  const h = host.split(":")[0].toLowerCase(); // strip port
  const root = rootDomain.split(":")[0].toLowerCase();
  if (h === root || h === `www.${root}`) return null; // apex / www -> no tenant
  if (!h.endsWith(`.${root}`)) return null; // not under the root domain
  const sub = h.slice(0, -(root.length + 1)); // remove ".<root>"
  if (!sub || sub.includes(".")) return null; // only a single-label subdomain is a slug
  return sub;
}

/**
 * Resolve the tenant slug for a request from two sources, in priority order:
 *   1. the proxy-set header (TENANT_HEADER) — present on page routes;
 *   2. the request Host — needed on `/api/*` routes, which bypass the proxy (see its
 *      matcher) and so never receive the header.
 * Returns null when neither yields a tenant (caller then uses the default tenant).
 */
export function resolveTenantSlug(
  headerSlug: string | null | undefined,
  host: string | null | undefined,
  rootDomain: string | undefined = process.env.NEXT_PUBLIC_ROOT_DOMAIN,
): string | null {
  const fromHeader = headerSlug?.trim();
  if (fromHeader) return fromHeader;
  return tenantSlugFromHost(host, rootDomain);
}
