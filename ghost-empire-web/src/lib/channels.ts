// src/lib/channels.ts
// Pure, server- AND client-safe (no prisma / next/headers / JSX imports): derive a
// portal's public streaming channel(s) for "watch live" links, white-label aware.
//
// Founder defaults mirror the LIVE entries in SOCIALS (components/SocialLinks.tsx) —
// duplicated here on purpose because that module is "use client" and its exports can't
// be called from server components (the [locale] layout, /drops).

export type ChannelLink = { url: string; label: string };
export type TenantSocial = { platform: string; url: string };

// The founder/default portal's LIVE channels (Twitch + Kick; the founder's YouTube is
// VODs, not live, so it's intentionally not a "watch live" target).
const FOUNDER_CHANNELS: ChannelLink[] = [
  { url: "https://twitch.tv/gh0s77tt", label: "twitch.tv/gh0s77tt" },
  { url: "https://kick.com/gh0s77tt", label: "kick.com/gh0s77tt" },
];

// Streaming platforms in display/priority order — index 0 is the "primary" channel.
const STREAMING_PLATFORMS = ["twitch", "kick", "youtube"];

/** Strip scheme + www + trailing slash → a compact display label (e.g. twitch.tv/foo). */
export function channelLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

/**
 * The portal's public streaming channels, ordered twitch → kick → youtube (so [0] is the
 * primary "watch live" target). Uses the portal's OWN configured socials when it has any
 * streaming link; otherwise the founder default ONLY on the founder/default portal, else
 * [] — a sub-tenant with no channels shows no channel, never the founder's (white-label).
 */
export function streamingChannels(
  socialLinks: TenantSocial[] | null | undefined,
  isFounderPortal: boolean,
): ChannelLink[] {
  if (socialLinks?.length) {
    const own: ChannelLink[] = [];
    for (const platform of STREAMING_PLATFORMS) {
      const link = socialLinks.find((l) => l.platform === platform);
      if (link) own.push({ url: link.url, label: channelLabel(link.url) });
    }
    // Tenant configured socials but none are streaming platforms → no live channel
    // (and crucially: no fall-through to the founder's channels).
    return own;
  }
  return isFounderPortal ? FOUNDER_CHANNELS : [];
}
