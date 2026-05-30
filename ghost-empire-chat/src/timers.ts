// Cyclic timers — fetched from the portal (/api/bot/chat-timers) and broadcast to
// all active platforms on their interval. Only fires while chat is active (recent
// messages) so it never spams an offline channel.
import { env } from "./env";
import { broadcast, recentlyActive } from "./broadcast";

type Timer = { id: string; message: string; intervalSeconds: number };

const REFRESH_EVERY_MS = 2 * 60 * 1000;
const TICK_MS = 15_000;
const ACTIVITY_WINDOW_MS = 15 * 60 * 1000; // treat "had chat in last 15 min" as live

let timers: Timer[] = [];
const lastSent = new Map<string, number>();

async function refresh(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/chat-timers`);
    if (!res.ok) return;
    const data = (await res.json()) as { timers?: Timer[] };
    if (Array.isArray(data.timers)) {
      timers = data.timers;
      const ids = new Set(timers.map((t) => t.id));
      for (const id of lastSent.keys()) if (!ids.has(id)) lastSent.delete(id);
      console.log(`[timers] loaded ${timers.length} from portal`);
    }
  } catch {
    /* keep current list on error */
  }
}

function tick(): void {
  if (!recentlyActive(ACTIVITY_WINDOW_MS)) return; // don't post to a dead/offline chat
  const now = Date.now();
  for (const t of timers) {
    const last = lastSent.get(t.id);
    if (last === undefined) {
      // first sighting — start the clock now, don't fire immediately
      lastSent.set(t.id, now);
      continue;
    }
    if (now - last >= t.intervalSeconds * 1000) {
      lastSent.set(t.id, now);
      void broadcast(t.message);
    }
  }
}

export function startTimers(): void {
  void refresh();
  setInterval(() => void refresh(), REFRESH_EVERY_MS);
  setInterval(tick, TICK_MS);
}
