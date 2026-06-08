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
 * Resolve the tenant slug for a request STRICTLY from its Host. Returns null when the
 * Host carries no tenant subdomain (apex / www / non-matching host / no root domain),
 * in which case the caller falls back to the default tenant.
 *
 * SECURITY: resolution is Host-only on purpose. The proxy forwards a convenience
 * `x-tenant-slug` header, but it is FORGEABLE — `/api/*` routes bypass the proxy, so a
 * client could set the header directly and switch tenant context (read/write another
 * tenant's data). We therefore never trust the header for resolution; the proxy still
 * strips any client-sent copy and re-sets it from the Host as defense-in-depth.
 */
export function resolveTenantSlug(
  host: string | null | undefined,
  rootDomain: string | undefined = process.env.NEXT_PUBLIC_ROOT_DOMAIN,
): string | null {
  return tenantSlugFromHost(host, rootDomain);
}
