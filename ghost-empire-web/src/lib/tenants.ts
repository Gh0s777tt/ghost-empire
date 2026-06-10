// src/lib/tenants.ts
// Pure helpers for tenant provisioning (admin-of-admins, Phase 6).

/** Subdomains that can never become tenant slugs. */
export const RESERVED_TENANT_SLUGS = new Set([
  "www", "api", "app", "admin", "mail", "smtp", "ftp", "cdn", "static",
  "assets", "status", "docs", "dev", "staging", "preview", "vercel",
]);

/**
 * Validate a tenant slug (future subdomain): 3-32 chars, lowercase kebab
 * (a-z, 0-9, single hyphens inside), not reserved. Returns an error code
 * (i18n key suffix) or null when valid.
 */
export function validateTenantSlug(slug: string): "format" | "reserved" | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(slug) || slug.includes("--")) return "format";
  if (RESERVED_TENANT_SLUGS.has(slug)) return "reserved";
  return null;
}
