// "Auto-pin" emulation for predictions/bets. Twitch & Kick have no public pin API,
// so while a bet is OPEN the bot re-announces it to chat periodically (and once
// immediately when a new bet opens) so it stays visible — gated on chat activity so
// it never shouts into an empty/offline chat.
import { env } from "./env";
import { broadcast, recentlyActive } from "./broadcast";

const POLL_MS = 60_000; // check for an open prediction every 60s
const ANNOUNCE_INTERVAL_MS = 5 * 60_000; // re-announce every 5 min while it stays open
const ACTIVE_WINDOW_MS = 15 * 60_000; // only announce if chat was active in the last 15 min

let lastAnnouncedId: string | null = null;
let lastAnnouncedAt = 0;

type ActivePrediction = { active: boolean; id?: string; question?: string; totalPot?: number };

async function tick(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/active-prediction`);
    if (!res.ok) return;
    const d = (await res.json()) as ActivePrediction;

    if (!d.active || !d.id) { lastAnnouncedId = null; return; }

    const isNew = d.id !== lastAnnouncedId;
    const due = Date.now() - lastAnnouncedAt >= ANNOUNCE_INTERVAL_MS;
    if (!isNew && !due) return;

    // Don't announce into a dead chat — wait until viewers are around.
    if (!recentlyActive(ACTIVE_WINDOW_MS)) return;

    lastAnnouncedId = d.id;
    lastAnnouncedAt = Date.now();
    const pot = typeof d.totalPot === "number" && d.totalPot > 0 ? ` Pula: ${d.totalPot} GT.` : "";
    await broadcast(`🎲 OTWARTY ZAKŁAD: ${d.question} — obstawiaj Ghost Tokens na ${env.portalUrl}/predictions${pot}`);
  } catch {
    /* ignore — retry next tick */
  }
}

export function startBetAnnounce(): void {
  setInterval(() => void tick(), POLL_MS);
}
