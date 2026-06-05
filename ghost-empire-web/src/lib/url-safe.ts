// src/lib/url-safe.ts
// Sanitizes user-supplied media URLs (shop item images, custom alert sounds, …).
// Only absolute http(s) URLs pass; everything else (javascript:, data:, vbscript:,
// relative, garbage) becomes null. Empty input → null. Non-breaking for existing
// valid http(s) URLs.

export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") return trimmed.slice(0, 2000);
  } catch {
    /* not a valid absolute URL */
  }
  return null;
}
