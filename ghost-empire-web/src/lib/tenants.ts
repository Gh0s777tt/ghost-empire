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

// A registrable hostname: dot-separated labels (each 1-63 chars, no leading/trailing hyphen),
// a ≥2-letter TLD, total ≤253 chars. Expects an already-normalized value (lowercase, no
// protocol/port/path/www — see customDomainFromHost). Rejects bare hosts like "localhost".
const CUSTOM_DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Validate a tenant's custom apex domain (#653). Pass the value AFTER `customDomainFromHost`
 * has normalized it. Returns "format" for anything that isn't a real domain, else null.
 */
export function validateCustomDomain(domain: string): "format" | null {
  return CUSTOM_DOMAIN_RE.test(domain) ? null : "format";
}
