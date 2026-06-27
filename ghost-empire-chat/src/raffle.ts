// src/raffle.ts
// Chat-keyword raffle — bot wiring for the web feature (#611/#615), per docs/RAFFLE-BOT.md.
// The active raffle keywords ride along on the /api/bot/chat-commands poll (read in
// commands.ts and pushed here via setRaffleKeywords). On each chat message that whole-
// matches a live keyword we report the entry to the portal (POST /api/internal/raffle-entry,
// Bearer BOT_SECRET); the server enters the LINKED viewer for free — 1/user, with sub/mod
// ticket weighting. Locally deduped so we never spam the portal. No chat echo (spam-free) —
// the streamer announces winners after the draw in /admin#events.
import { env } from "./env";

let keywords = new Set<string>();
const seen = new Set<string>(); // `${keyword}:${platform}:${username}` — reset when the keyword set changes

/** Update the active raffle keywords (called from the commands sync — same /api/bot/chat-commands response). */
export function setRaffleKeywords(list: string[]): void {
  const next = new Set(list.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.toLowerCase()));
  const changed = next.size !== keywords.size || [...next].some((k) => !keywords.has(k));
  if (changed) {
    seen.clear(); // new raffle / ended → reset local dedupe
    if (next.size) console.log(`[raffle] active keywords: ${[...next].join(", ")}`);
  }
  keywords = next;
}

/**
 * On each chat message: if it whole-matches a live raffle keyword, report the entry to the
 * portal (fire-and-forget). The server is idempotent (1 entry/user) and silently ignores
 * unlinked accounts, so a missed local dedupe or a non-viewer match is harmless.
 */
export function checkRaffleEntry(
  platform: "twitch" | "kick" | "youtube",
  username: string | undefined,
  text: string,
  isSub: boolean,
  isMod: boolean,
): void {
  if (keywords.size === 0 || !username) return;
  const kw = text.trim().toLowerCase();
  if (!keywords.has(kw)) return;
  const dedupe = `${kw}:${platform}:${username.toLowerCase()}`;
  if (seen.has(dedupe)) return;
  if (seen.size > 5000) seen.clear(); // safety bound — a single raffle won't approach this
  seen.add(dedupe);
  void fetch(`${env.portalUrl}/api/internal/raffle-entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.botSecret}` },
    body: JSON.stringify({ keyword: kw, platform, username, isSub, isMod }),
  }).catch(() => {}); // ok:true even when entered:false (no active raffle / unlinked / already entered)
}
