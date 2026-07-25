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

// =====================================================
// PER-TENANT BOT SECRET (#599 follow-up)
// =====================================================
// `Tenant.botSecret` is a bearer token the portal's own bot instance authenticates
// with (see verifyBotSecretForTenant). It is a SERVER secret: it is deliberately
// absent from TenantBrand/getCurrentTenant(), and the provisioning API shows the
// generated value exactly once, then only ever the hint below. The two helpers here
// are pure so the "who may rotate it" rule and the masking are unit-testable without
// a DB.

/** How many trailing characters of a bot secret the hint reveals. */
const BOT_SECRET_HINT_CHARS = 4;

/**
 * Render a non-reversible display hint for a stored bot secret — `"…Xk7q"`.
 *
 * @param secret - The stored secret, or null/empty when the portal has none.
 * @returns The hint, or null when there is nothing configured.
 *
 * @remarks
 * The admin needs to tell "the secret in my bot's `.env` is the one this portal has"
 * apart from "it's a stale one", and a 4-char tail does that. It is NOT a partial
 * disclosure worth worrying about: a 32-byte token keeps ~228 bits of entropy with
 * the tail known. Anything longer would start being useful to an attacker who has
 * read access to the panel but not the DB — so the width is capped here, not at the
 * call site. Secrets shorter than the hint width return `"…"` rather than leaking
 * themselves whole (only reachable for a hand-written DB value).
 */
export function maskBotSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= BOT_SECRET_HINT_CHARS) return "…";
  return `…${secret.slice(-BOT_SECRET_HINT_CHARS)}`;
}

/**
 * May this admin provision the bot secret of this portal?
 *
 * @param caller - The gated admin: their user id, their own `tenantId` (null for
 *   legacy/unmigrated accounts), whether they hold `isAdmin`, and whether they are
 *   the platform owner (permanent-admin email).
 * @param tenant - The portal being targeted: its row id and `ownerUserId`.
 * @returns True when the rotation is allowed.
 *
 * @remarks
 * Deliberately stricter than `requireAdmin()` alone. That gate lets an account with a
 * NULL `tenantId` (legacy, pre-#369 self-heal) administer ANY host portal — harmless
 * for portal content, but it must not hand out a credential that authenticates a bot
 * against another streamer's economy endpoints. So a plain admin needs an explicit
 * tenant match; the portal's own owner passes from any host (mirroring
 * `/api/onboarding/my`); the platform owner passes everywhere (admin-of-admins).
 */
export function canManageTenantBotSecret(
  caller: { userId: string; tenantId: string | null; isAdmin: boolean; isPlatformOwner: boolean },
  tenant: { id: string; ownerUserId: string | null },
): boolean {
  if (caller.isPlatformOwner) return true;
  if (!caller.isAdmin) return false;
  // The streamer who owns this portal — may manage it from the apex too, not just
  // from their own subdomain (the owner often lands on the main domain first).
  if (tenant.ownerUserId !== null && tenant.ownerUserId === caller.userId) return true;
  // Any other admin must actually belong to THIS portal. NULL tenantId → no.
  return caller.tenantId !== null && caller.tenantId === tenant.id;
}
