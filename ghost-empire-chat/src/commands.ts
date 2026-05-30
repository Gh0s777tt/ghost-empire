// Chat commands — now managed from the portal (/admin#chat) instead of hardcoded.
// The bot fetches enabled commands from /api/bot/chat-commands on startup and every
// few minutes (cached). The list below is only a FALLBACK used when the very first
// fetch fails (offline / portal down) so the bot is never command-less on boot.
import { env } from "./env";

type Command = { trigger: string; response: string; cooldownSec: number };

const REFRESH_EVERY_MS = 2 * 60 * 1000;

const FALLBACK: Command[] = [
  { trigger: "!portal", response: `Zgarniaj Ghost Tokens: ${env.portalUrl}`, cooldownSec: 15 },
  { trigger: "!ranking", response: `Ranking widzów: ${env.portalUrl}/ranking`, cooldownSec: 15 },
  { trigger: "!sklep", response: `Wydaj GT w sklepie: ${env.portalUrl}/shop`, cooldownSec: 15 },
  { trigger: "!questy", response: `Dzienne questy: ${env.portalUrl}/quests`, cooldownSec: 15 },
];

// Seed with the fallback so there's never an empty window before the first fetch.
let commands: Command[] = FALLBACK;
let everLoaded = false;
const lastUsed = new Map<string, number>();

/** Fetch the enabled commands from the portal. Keeps the current list on error. */
export async function refreshCommands(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/chat-commands`);
    if (!res.ok) {
      console.warn(`[commands] fetch ${res.status} — keeping current (${commands.length})`);
      return;
    }
    const data = (await res.json()) as {
      commands?: { trigger: string; response: string; cooldownSeconds: number }[];
    };
    if (Array.isArray(data.commands)) {
      // Empty list from the portal is intentional (admin disabled/removed all) — respect it,
      // but only once we've successfully loaded at least once.
      commands = data.commands.map((c) => ({
        trigger: c.trigger.toLowerCase(),
        response: c.response,
        cooldownSec: c.cooldownSeconds,
      }));
      everLoaded = true;
      console.log(`[commands] loaded ${commands.length} from portal`);
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
  const cmd = commands.find((c) => c.trigger === trigger);
  if (!cmd) return null;
  const now = Date.now();
  if (now - (lastUsed.get(trigger) ?? 0) < cmd.cooldownSec * 1000) return null;
  lastUsed.set(trigger, now);
  return cmd.response;
}

// Exposed for tests / diagnostics.
export function _state() {
  return { count: commands.length, everLoaded };
}
