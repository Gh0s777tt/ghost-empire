// src/lib/song-requests.ts
// Shared song-request helpers used by both the bot enqueue route (/api/internal/song-request)
// and the admin manual-add (/api/admin/song-requests). The oEmbed URL builder is pure +
// tested; fetchTitle does the (best-effort, never-throwing) network call.

/** Normalize a requester's chat handle for ban matching: trimmed, lowercased, capped. */
export function normalizeRequester(name: string): string {
  return name.trim().toLowerCase().slice(0, 80);
}

/** The oEmbed endpoint for a YouTube/Spotify link, or null if the query isn't a supported URL. */
export function oembedUrlFor(query: string): string | null {
  if (!/^https?:\/\//i.test(query)) return null;
  if (/youtube\.com|youtu\.be/i.test(query)) return `https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`;
  if (/open\.spotify\.com/i.test(query)) return `https://open.spotify.com/oembed?url=${encodeURIComponent(query)}`;
  return null;
}

/** Best-effort title from a YouTube/Spotify link via oEmbed (no API key, no quota). Never throws. */
export async function fetchSongTitle(query: string): Promise<string | null> {
  const url = oembedUrlFor(query);
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ? data.title.slice(0, 200) : null;
  } catch {
    return null; // never block the request on a flaky oEmbed
  }
}
