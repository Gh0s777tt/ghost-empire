// src/lib/portal-hub.ts
// Pure helpers for the cross-portal "switch streamers" hub (#508). No I/O — the
// DB reads live in the API route; this file only computes portal URLs and ordering
// so it's trivially unit-testable. A portal's public URL is its custom domain if
// set, else `https://<slug>.<root-domain>`. Until NEXT_PUBLIC_ROOT_DOMAIN is
// configured (subdomains not deployed yet) a slug-only portal has no absolute URL —
// portalUrl returns null and the UI renders it as the current/non-switchable portal.

export type PortalTenant = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  domain: string | null;
};

export type PortalLink = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  /** Absolute URL to switch to this portal, or null when not externally routable. */
  url: string | null;
  isCurrent: boolean;
};

/** Absolute URL for a portal, or null when it isn't externally routable yet. */
export function portalUrl(
  t: Pick<PortalTenant, "slug" | "domain">,
  rootDomain: string | undefined = process.env.NEXT_PUBLIC_ROOT_DOMAIN,
): string | null {
  const domain = t.domain?.trim();
  if (domain) return `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const root = rootDomain?.split(":")[0].trim();
  if (!root) return null;
  const slug = t.slug.trim();
  if (!slug) return null;
  return `https://${slug}.${root}`;
}

/**
 * Build the ordered hub list: the current portal first, then followed portals
 * alphabetically by name. Deduplicates by slug (the current portal might also be
 * in the follow list). `currentSlug` may be null (no tenant resolved / fallback).
 */
export function buildPortalList(
  current: PortalTenant | null,
  followed: PortalTenant[],
  currentSlug: string | null,
  rootDomain: string | undefined = process.env.NEXT_PUBLIC_ROOT_DOMAIN,
): PortalLink[] {
  const seen = new Set<string>();
  const out: PortalLink[] = [];

  const push = (t: PortalTenant, isCurrent: boolean) => {
    if (seen.has(t.slug)) return;
    seen.add(t.slug);
    out.push({
      slug: t.slug,
      name: t.name,
      logoUrl: t.logoUrl,
      brandColor: t.brandColor,
      url: portalUrl(t, rootDomain),
      isCurrent,
    });
  };

  if (current) push(current, current.slug === currentSlug);

  followed
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((t) => push(t, t.slug === currentSlug));

  return out;
}
