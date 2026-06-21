// src/lib/xbox.ts
// Xbox (Xbox Live / Game Pass) library via OpenXBL (xbl.io) — a per-user API-key gateway,
// the pragmatic alternative to Microsoft's partner-gated XSAPI. The streamer generates a
// key at https://xbl.io and pastes it in the admin; we read their played-titles history.
// Dormant until a key is set (per-portal, encrypted at rest). #audit3
export type XboxTitle = { id: string; name: string; image: string | null; lastPlayed: string | null };

type RawTitle = {
  titleId?: string | number;
  name?: string;
  displayImage?: string;
  images?: Array<{ url?: string; type?: string }>;
  titleHistory?: { lastTimePlayed?: string };
};

/**
 * Pure: map an OpenXBL `titleHistory` payload to our shape. Defensive — tolerates missing
 * fields and picks the best available image (BoxArt/Logo → any). Unit-tested without network.
 */
export function mapXboxTitles(raw: unknown): XboxTitle[] {
  const titles =
    raw && typeof raw === "object" && Array.isArray((raw as { titles?: unknown }).titles)
      ? ((raw as { titles: RawTitle[] }).titles)
      : [];
  const out: XboxTitle[] = [];
  for (const t of titles) {
    const id = t?.titleId != null ? String(t.titleId) : "";
    const name = (t?.name ?? "").trim();
    if (!id || !name) continue;
    const pick = (type: string) => t?.images?.find((i) => i?.url && i.type === type)?.url;
    // Prefer BoxArt, then Logo, then any available image.
    const image = t?.displayImage || pick("BoxArt") || pick("Logo") || t?.images?.find((i) => i?.url)?.url || null;
    out.push({ id, name: name.slice(0, 200), image: image ?? null, lastPlayed: t?.titleHistory?.lastTimePlayed ?? null });
  }
  return out;
}

export async function fetchXboxTitles(apiKey: string): Promise<XboxTitle[]> {
  if (!apiKey) throw new Error("Xbox API key nie ustawiony");
  const res = await fetch("https://xbl.io/api/v2/player/titleHistory", {
    headers: { "X-Authorization": apiKey, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`xbl.io ${res.status}`);
  return mapXboxTitles(await res.json());
}
