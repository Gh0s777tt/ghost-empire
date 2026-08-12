// Song requests — viewers type "!sr <link or title>" to queue a song, or "!unsr"/"!wrongsong"
// to pull their OWN last still-queued request back out ("dodałem zły utwór"). The bot posts
// both to the portal (/api/internal/song-request, Bearer BOT_SECRET) and the streamer manages
// the queue on /admin#songs. The per-platform dispatchers (twitch/kick/youtube) already route
// every song-request trigger through isSongRequest → handleSongRequest, so recognising the
// cancel triggers HERE lights them up on all three platforms without touching those files.
import { env } from "./env";

const TRIGGER = "!sr";
// Cofnięcie własnej prośby — !wrongsong to czytelny alias !unsr (oba = "usuń mój ostatni utwór").
const CANCEL_TRIGGERS = new Set(["!unsr", "!wrongsong"]);
const MAX_QUERY = 200;

/** First whitespace-delimited token, lowercased — the command trigger. */
function firstWord(message: string): string {
  return message.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function isSongRequest(message: string): boolean {
  const w = firstWord(message);
  return w === TRIGGER || CANCEL_TRIGGERS.has(w);
}

/** Enqueue the request; returns a chat reply (confirmation / usage / error), or null to stay silent. */
export async function handleSongRequest(
  platform: string,
  username: string | undefined,
  message: string,
): Promise<string | null> {
  // !unsr/!wrongsong dzielą tę samą ścieżkę auth/tenant co !sr (Bearer BOT_SECRET, Host=portal),
  // różnią się tylko action:"cancel" — więc trzymamy je w jednym handlerze zamiast osobnej komendy.
  if (CANCEL_TRIGGERS.has(firstWord(message))) return handleSongCancel(platform, username);

  const query = message.trim().slice(TRIGGER.length).trim();
  if (!query) return "Użycie: !sr <link lub tytuł utworu>";
  try {
    const res = await fetch(`${env.portalUrl}/api/internal/song-request`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify({
        query: query.slice(0, MAX_QUERY),
        requestedBy: username ?? "widz",
        platform,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { position?: number };
      return data.position ? `🎵 Dodano do kolejki (pozycja ${data.position})` : "🎵 Dodano do kolejki!";
    }
    if (res.status === 429) return "⏳ Kolejka jest pełna — spróbuj później.";
    return null; // other errors: stay quiet
  } catch {
    return null;
  }
}

/**
 * Cancel the caller's OWN most-recent still-queued request (!unsr / !wrongsong). The portal
 * matches on the caller's handle + status "queued", so a viewer can only ever remove their own
 * song, never someone else's. Plain-string replies (no currency terms → no branding needed).
 */
async function handleSongCancel(
  platform: string,
  username: string | undefined,
): Promise<string | null> {
  try {
    const res = await fetch(`${env.portalUrl}/api/internal/song-request`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify({ action: "cancel", requestedBy: username ?? "widz", platform }),
    });
    if (res.ok) return "🗑️ Usunięto Twój ostatni utwór z kolejki.";
    if (res.status === 404) return "🤔 Nie masz utworu w kolejce do usunięcia.";
    return null; // other errors: stay quiet (same contract as !sr)
  } catch {
    return null;
  }
}
