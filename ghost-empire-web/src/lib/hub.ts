// src/lib/hub.ts
// Link-in-bio "Hub" (Linktree-style, #hub) — pure helpers for the per-portal /hub page. A portal
// owner curates an ordered list of link buttons rendered on a public, mobile-first, brand-themed
// page they can share (Twitch/IG bio etc.). Storage is a Json column on Tenant (like socialLinks),
// so parsing is defensive on BOTH read (render) and write (PATCH) — never trust the blob. No I/O
// here → unit-tested. Multi-tenant: the links belong to whichever tenant row holds them.

export type HubLink = {
  /** Stable id (client-generated) so React keys + reorders survive edits. */
  id: string;
  label: string;
  url: string;
  /** Optional leading glyph — a single emoji the owner types; falls back to a default in the UI. */
  icon?: string;
};

export const HUB_MAX_LINKS = 20;
export const HUB_LABEL_MAX = 40;
export const HUB_BIO_MAX = 200;

/** True for an http(s) URL — the only schemes we render as a link (no javascript:/data: etc.). */
export function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u.trim());
}

/**
 * Coerce a stored/incoming hub-links blob into a safe, ordered HubLink[]. Drops anything without a
 * non-empty label + http(s) url; trims to HUB_MAX_LINKS. Used verbatim on read and on save so the
 * DB can never hold — nor the page ever render — a malformed or unsafe entry. Pure; unit-tested.
 */
export function parseHubLinks(raw: unknown): HubLink[] {
  if (!Array.isArray(raw)) return [];
  const out: HubLink[] = [];
  let auto = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, HUB_LABEL_MAX) : "";
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!label || !isHttpUrl(url)) continue;
    const iconRaw = typeof rec.icon === "string" ? rec.icon.trim().slice(0, 8) : "";
    const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 40) : `l${auto}`;
    const link: HubLink = { id, label, url };
    if (iconRaw) link.icon = iconRaw;
    out.push(link);
    auto += 1;
    if (out.length >= HUB_MAX_LINKS) break;
  }
  return out;
}

/** Clamp a bio string to the stored max (null when empty). Pure. */
export function sanitizeHubBio(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, HUB_BIO_MAX);
  return s || null;
}
