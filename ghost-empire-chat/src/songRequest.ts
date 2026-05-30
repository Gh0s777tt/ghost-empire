// Song requests — viewers type "!sr <link or title>" to queue a song. The bot
// posts it to the portal (/api/internal/song-request, Bearer BOT_SECRET) and the
// streamer manages the queue on /admin#songs.
import { env } from "./env";

const TRIGGER = "!sr";
const MAX_QUERY = 200;

export function isSongRequest(message: string): boolean {
  return message.trim().split(/\s+/)[0]?.toLowerCase() === TRIGGER;
}

/** Enqueue the request; returns a chat reply (confirmation / usage / error), or null to stay silent. */
export async function handleSongRequest(
  platform: string,
  username: string | undefined,
  message: string,
): Promise<string | null> {
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
