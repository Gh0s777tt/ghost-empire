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
import { normalizeDailyChips, DAILY_CHIPS_DEFAULT } from "@/lib/daily-chips";
import { decryptSecret } from "@/lib/crypto";

/** Slug (and future subdomain) of the original single-streamer tenant. */
export const DEFAULT_TENANT_SLUG = "ghost-empire";

export type TenantBrand = {
  /** Tenant row id, or null when falling back to SITE (no row yet). */
  id: string | null;
  slug: string;
  /** Streamer-admin who owns this portal; null for platform-seeded brands (founder / the
   *  E-Forge public brand). Tells a streamer's white-label sub-portal from a platform
   *  storefront — see isPlatformBrand (#746). Kept server-side (never in client branding). */
  ownerUserId: string | null;
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
  /** Per-portal /support copy (#742); null → localized template. */
  supportHeading: string | null;
  supportIntro: string | null;
  supportThanks: string | null;
  /** Size of the free daily casino-chips grant on this portal (docs/CHIPS-CASINO.md). */
  dailyChipsAmount: number;
  /** Keys of viewer features the owner DISABLED for this portal (allow-by-default; see lib/features).
   *  Client-safe (which modules are on/off is not sensitive) → fed to the nav to hide toggled features. */
  disabledFeatures: string[];
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
  ownerUserId: null,
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
  supportHeading: null,
  supportIntro: null,
  supportThanks: null,
  dailyChipsAmount: DAILY_CHIPS_DEFAULT,
  disabledFeatures: [],
};

/** Map a Tenant row to the request-facing brand (shared by every resolution path). */
function toBrand(t: Tenant): TenantBrand {
  return {
    id: t.id,
    slug: t.slug,
    ownerUserId: t.ownerUserId,
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
    supportHeading: t.supportHeading,
    supportIntro: t.supportIntro,
    supportThanks: t.supportThanks,
    // Re-clamped on read: a value written before the bounds existed (or edited straight in
    // the DB) must not hand out an extreme grant.
    dailyChipsAmount: normalizeDailyChips(t.dailyChipsAmount),
    // Allow-by-default: a value written before this column existed reads as `[]` (DB default), so an
    // un-migrated / legacy row shows every feature. Guard against a stray non-array just in case.
    disabledFeatures: Array.isArray(t.disabledFeatures) ? t.disabledFeatures : [],
  };
}

/**
 * Resolve the Tenant ROW for the current request from its Host. Never trusts the
 * forgeable `x-tenant-slug` header (see resolveTenantSlug) — resolution is Host-only:
 *   1) a real tenant subdomain (<slug>.<root>) resolves by slug,
 *   2) otherwise (apex / www / a fully custom domain like empire-forge.com) a tenant whose
 *      `domain` matches the request host wins over the default (#653 — white-label apex),
 *   3) otherwise the default (founder) tenant.
 * Returns null outside a request scope (no headers()) or before the tenants table exists
 * (pre-`prisma db push`), so both callers below degrade gracefully.
 *
 * Wrapped in React `cache()` so the many calls per request (root layout metadata+viewport,
 * [locale] layout, i18n request config, SiteFooter, the page itself — plus the bot-auth
 * helper) collapse to ONE `tenant.findUnique`. Per-request only — no cross-request TTL,
 * so an owner's branding edit still shows instantly.
 *
 * PRIVATE on purpose: the row carries server-only secrets (`botSecret`) that must never
 * reach a client. Expose it only through the narrow helpers below — `getCurrentTenant()`
 * maps it through `toBrand` (which drops the secret) for client branding, and
 * `getCurrentTenantBotAuth()` returns just the id + secret for server-side bot auth.
 */
const resolveCurrentTenantRow = cache(async function resolveCurrentTenantRow(): Promise<Tenant | null> {
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
    let t: Tenant | null = null;
    if (subSlug) {
      t = await prisma.tenant.findUnique({ where: { slug: subSlug } });
    } else {
      const domain = customDomainFromHost(host);
      if (domain) t = await prisma.tenant.findUnique({ where: { domain } });
    }
    if (!t) t = await prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG } });
    return t;
  } catch {
    // Tenant table not migrated yet (before `prisma db push`) — resolve to null.
    return null;
  }
});

/**
 * Resolve the active tenant's BRAND for the current request (client-safe). Falls back to
 * the SITE-derived brand outside a request scope or before the tenant row exists. Cached
 * (shares `resolveCurrentTenantRow`'s single lookup).
 */
export const getCurrentTenant = cache(async function getCurrentTenant(): Promise<TenantBrand> {
  const t = await resolveCurrentTenantRow();
  return t ? toBrand(t) : FALLBACK_TENANT;
});

/**
 * Server-only bot-auth context for the current request: the tenant's row `id` (to SCOPE
 * bot-facing user/connection lookups to this portal) and its optional per-tenant `botSecret`
 * (to AUTHENTICATE a tenant running its own bot instance). Resolved by the SAME Host logic as
 * `getCurrentTenant()` — never the forgeable `x-tenant-slug` header.
 *
 * Kept deliberately OUT of `TenantBrand`: `botSecret` is a server secret and must never enter
 * the client branding payload. Returns `{ id: null, botSecret: null }` outside a request scope
 * or before the tenant row exists — callers then accept ONLY the global BOT_SECRET (the
 * backward-compatible floor; see `verifyBotSecretForTenant`). #saas-botsecret
 */
export async function getCurrentTenantBotAuth(): Promise<{ id: string | null; botSecret: string | null }> {
  const t = await resolveCurrentTenantRow();
  // AUDYT 2026-08 (zgoda właściciela): `Tenant.botSecret` jest teraz szyfrowany at-rest
  // (AES-256-GCM przez encryptSecret w trasie rotacji) — dotąd był JEDYNYM sekretem w schemacie
  // trzymanym plaintextem, w przeciwieństwie do Connection tokenów, secretEnc/tokenEnc i TOTP.
  // To JEDYNY punkt odczytu do porównania (→ dalej verifyBotSecretForTenant), więc "każdy
  // weryfikator musi pamiętać o decrypt" sprowadza się do tej jednej linii.
  // DUAL-READ / drift-safe: decryptSecret zwraca legacy plaintext bez zmian (rollout bez migracji
  // wsteczny), a przy dryfie ENCRYPTION_KEY zwraca null → sekret tenanta po prostu nie zmatchuje →
  // spadamy na globalny BOT_SECRET (udokumentowana podłoga), zamiast położyć bot-auth. Jedynie
  // tenant z BOT_SECRET_STRICT poczułby dryf — świadomy koszt jego własnego opt-inu w ostrość.
  return { id: t?.id ?? null, botSecret: decryptSecret(t?.botSecret ?? null) };
}

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

/**
 * Is this a platform storefront brand — where the "Go Premium" CTA belongs for EVERYONE —
 * as opposed to a streamer's white-label sub-portal? True for the founder portal and for any
 * platform-seeded brand (no streamer owner, e.g. the E-Forge brand on empire-forge.com).
 * A streamer's portal is created via onboarding, so it has an `ownerUserId` and isn't the
 * founder → NOT a storefront: there only the portal admin (who can actually upgrade it) sees
 * Premium, never the streamer's viewers (#746). Note the founder portal keeps an ownerUserId,
 * so `isFounderBrand` is the needed second arm — neither test alone covers both brands.
 */
export function isPlatformBrand(t: { id: string | null; slug: string; ownerUserId: string | null }): boolean {
  return isFounderBrand(t) || t.ownerUserId === null;
}
