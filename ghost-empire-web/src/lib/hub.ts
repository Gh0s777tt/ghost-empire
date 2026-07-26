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

// ── Live badge + platform tiles for /hub (#815) ─────────────────────────────────────────────────
//
// WHITE-LABEL, and this is the part that must never slip: the hub is a PUBLIC page on a streamer's
// own portal, so every value here comes from that portal's own config. There is deliberately NO
// fallback to the founder's channels — `parseTenantSocials` falls back to the founder SOCIALS list
// when a tenant has none, which is right for the footer but would be a leak here: another streamer's
// link-in-bio page would advertise the founder's Twitch. An empty list renders NO tiles instead.

/** Platforms a hub tile can be rendered for, with the label shown on it. */
export const HUB_PLATFORMS: Record<string, string> = {
  twitch: "Twitch",
  kick: "Kick",
  youtube: "YouTube",
  rumble: "Rumble",
  discord: "Discord",
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export type HubPlatformTile = { platform: string; label: string; url: string };

/**
 * Build the platform tiles from a portal's OWN social links.
 *
 * @param socials - `tenant.socialLinks` as stored; pass the raw per-tenant list, never a fallback.
 * @returns One tile per recognised platform with a valid http(s) URL, in the portal's own order.
 *
 * @remarks
 * Unknown platforms are dropped rather than rendered with a raw key as their label — a tile reading
 * "myspace" would look like a bug. Non-http URLs are dropped by {@link isHttpUrl}, which is what keeps
 * a `javascript:` entry out of a public page.
 */
export function hubPlatformTiles(socials: { platform: string; url: string }[] | null | undefined): HubPlatformTile[] {
  if (!Array.isArray(socials)) return [];
  const out: HubPlatformTile[] = [];
  const seen = new Set<string>();
  for (const s of socials) {
    const key = typeof s?.platform === "string" ? s.platform.trim().toLowerCase() : "";
    const label = HUB_PLATFORMS[key];
    if (!label || seen.has(key)) continue;
    if (typeof s.url !== "string" || !isHttpUrl(s.url)) continue;
    seen.add(key);
    out.push({ platform: key, label, url: s.url });
  }
  return out;
}

/** What the hub shows about a live stream, or null when nothing is live. */
export type HubLive = { platform: string; label: string; startedAt: Date };

/**
 * Derive the live badge from the portal's own open stream sessions.
 *
 * @param sessions - Rows with `endedAt === null` meaning "still live", for THIS portal only.
 * @param now - Current time, injected so the staleness guard is testable.
 * @param maxHours - Treat an older open session as a missed offline event rather than a live stream.
 * @returns The most recently started live session, or null.
 *
 * @remarks
 * The staleness guard is the load-bearing part. `endedAt` is set by an EventSub `stream.offline`
 * webhook, and a missed webhook leaves the row open forever — without a bound the hub would claim the
 * streamer is live for weeks. Showing nothing is the safe direction: a missed "live" costs a click,
 * a false "live" costs trust.
 */
export function hubLive(
  sessions: { platform: string; startedAt: Date; endedAt: Date | null }[],
  now: Date,
  maxHours = 24,
): HubLive | null {
  const cutoff = now.getTime() - maxHours * 3_600_000;
  const open = sessions
    .filter((s) => s.endedAt === null && s.startedAt.getTime() >= cutoff && s.startedAt.getTime() <= now.getTime())
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const s = open[0];
  if (!s) return null;
  const key = s.platform.trim().toLowerCase();
  return { platform: key, label: HUB_PLATFORMS[key] ?? s.platform, startedAt: s.startedAt };
}
