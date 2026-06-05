// Emoji combo detection. When the same emoji shows up from enough separate messages
// within a short window, we POST a "combo" to the portal so the /overlay/emoji-combo
// OBS source can celebrate it. Counts once per message (so one user spamming a single
// message doesn't trigger it — a combo means many viewers reacting together).
import { env } from "./env";

const WINDOW_MS = 8000; // messages within this window count toward a combo
const THRESHOLD = 5;    // distinct messages with the same emoji to fire
const COOLDOWN_MS = 6000; // per-emoji cooldown after firing

// Matches a single emoji incl. ZWJ sequences (e.g. 👨‍👩‍👧). Skin-tone modifiers ride along.
const EMOJI_RE = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*/gu;

const windows = new Map<string, number[]>();
const cooldownUntil = new Map<string, number>();

function distinctEmojis(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(EMOJI_RE)) found.add(m[0]);
  return [...found];
}

function pushCombo(emoji: string, count: number): void {
  void fetch(`${env.portalUrl}/api/internal/emoji-combo`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
    body: JSON.stringify({ emoji, count }),
  }).catch(() => {});
}

/** Feed each incoming chat message here. Fires a combo when a threshold is crossed. */
export function trackEmojis(text: string): void {
  if (!text) return;
  const now = Date.now();
  for (const emoji of distinctEmojis(text)) {
    const arr = (windows.get(emoji) ?? []).filter((t) => now - t < WINDOW_MS);
    arr.push(now);
    windows.set(emoji, arr);
    if (arr.length >= THRESHOLD && now >= (cooldownUntil.get(emoji) ?? 0)) {
      cooldownUntil.set(emoji, now + COOLDOWN_MS);
      pushCombo(emoji, arr.length);
      console.log(`[emoji-combo] ${emoji} x${arr.length}`);
    }
  }
}

/** Periodically drop stale window/cooldown entries so the maps don't grow forever. */
export function startEmojiCombo(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [emoji, arr] of windows) {
      const fresh = arr.filter((t) => now - t < WINDOW_MS);
      if (fresh.length === 0) windows.delete(emoji);
      else windows.set(emoji, fresh);
    }
    for (const [emoji, until] of cooldownUntil) if (now >= until) cooldownUntil.delete(emoji);
  }, 60_000);
}
