// Chat commands — now managed from the portal (/admin#chat) instead of hardcoded.
// The bot fetches enabled commands from /api/bot/chat-commands on startup and every
// few minutes (cached). `fallbackCommands()` below only serves the window before the
// FIRST successful fetch (offline / portal down), so the bot is never command-less on
// boot; its viewer-facing copy names the currency via branding.ts, never a literal.
import { env } from "./env";
import { tokenName } from "./branding";
import { setRaffleKeywords } from "./raffle";

type Command = {
  trigger: string;
  response: string;
  cooldownSec: number;
  requiresLive: boolean;     // only fires while the stream is live
  activeFromMinute: number;  // only after the stream has been live N minutes (0 = always)
};

const REFRESH_EVERY_MS = 2 * 60 * 1000;

// Built on demand, NOT at module load: the currency name arrives from the portal
// (see branding.ts) after this module is imported, so a top-level const here would
// bake in whatever branding was cached at import time — i.e. the neutral fallback.
// Memoised on the currency name so the common path is one string compare, and a
// currency rename mid-process rebuilds the list by itself.
let fallbackCache: { token: string; list: Command[] } | null = null;

function fallbackCommands(): Command[] {
  const token = tokenName();
  if (fallbackCache?.token !== token) {
    fallbackCache = {
      token,
      list: [
        { trigger: "!portal", response: `Zgarniaj ${token}: ${env.portalUrl}`, cooldownSec: 15, requiresLive: false, activeFromMinute: 0 },
        { trigger: "!ranking", response: `Ranking widzów: ${env.portalUrl}/ranking`, cooldownSec: 15, requiresLive: false, activeFromMinute: 0 },
        { trigger: "!sklep", response: `Wydaj ${token} w sklepie: ${env.portalUrl}/shop`, cooldownSec: 15, requiresLive: false, activeFromMinute: 0 },
        { trigger: "!questy", response: `Dzienne questy: ${env.portalUrl}/quests`, cooldownSec: 15, requiresLive: false, activeFromMinute: 0 },
      ],
    };
  }
  return fallbackCache.list;
}

// null = the portal has never answered → serve the fallback, so there's never an
// empty window before the first fetch. An empty ARRAY is a real answer ("admin
// disabled every command") and is respected as such.
let commands: Command[] | null = null;

/** The list actually matched against — portal-loaded once available, else the fallback. */
function active(): Command[] {
  return commands ?? fallbackCommands();
}

// Live status synced from the portal (derived from Twitch StreamSession) — used to
// gate conditional commands without the bot polling Twitch itself.
let live = false;
let liveSince: number | null = null;
const lastUsed = new Map<string, number>();

/** Fetch the enabled commands from the portal. Keeps the current list on error. */
export async function refreshCommands(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/chat-commands`);
    if (!res.ok) {
      console.warn(`[commands] fetch ${res.status} — keeping current (${active().length})`);
      return;
    }
    const data = (await res.json()) as {
      commands?: { trigger: string; response: string; cooldownSeconds: number; requiresLive?: boolean; activeFromMinute?: number }[];
      live?: boolean;
      liveSince?: string | null;
      raffleKeywords?: string[];
    };
    // Live status travels with the command sync (independent of the commands array).
    live = data.live ?? false;
    liveSince = data.liveSince ? new Date(data.liveSince).getTime() : null;
    // Active raffle keywords ride along on the same response (#615) — hand them to the
    // raffle module so chat-keyword entries work without an extra fetch.
    setRaffleKeywords(data.raffleKeywords ?? []);
    if (Array.isArray(data.commands)) {
      // Empty list from the portal is intentional (admin disabled/removed all) — respect it,
      // but only once we've successfully loaded at least once.
      commands = data.commands.map((c) => ({
        trigger: c.trigger.toLowerCase(),
        response: c.response,
        cooldownSec: c.cooldownSeconds,
        requiresLive: c.requiresLive ?? false,
        activeFromMinute: c.activeFromMinute ?? 0,
      }));
      console.log(`[commands] loaded ${commands.length} from portal (live=${live})`);
    }
  } catch (e) {
    console.warn("[commands] fetch failed — keeping current:", (e as Error).message);
  }
}

/** Start periodic command sync. Call once at startup. */
export function startCommandSync(): void {
  void refreshCommands();
  setInterval(() => void refreshCommands(), REFRESH_EVERY_MS);
}

/** Returns the response if the first word matches a command and it's off cooldown. */
export function matchCommand(message: string): string | null {
  const trigger = message.trim().split(/\s+/)[0]?.toLowerCase();
  if (!trigger) return null;
  const cmd = active().find((c) => c.trigger === trigger);
  if (!cmd) return null;
  // Conditional gating (live status synced from the portal).
  if (cmd.requiresLive && !live) return null;
  if (cmd.activeFromMinute > 0) {
    if (!live || liveSince === null) return null;
    const minutesLive = (Date.now() - liveSince) / 60_000;
    if (minutesLive < cmd.activeFromMinute) return null;
  }
  const now = Date.now();
  if (now - (lastUsed.get(trigger) ?? 0) < cmd.cooldownSec * 1000) return null;
  lastUsed.set(trigger, now);
  return cmd.response;
}

// Exposed for tests / diagnostics.
export function _state() {
  return { count: active().length, everLoaded: commands !== null, live, liveSince };
}
