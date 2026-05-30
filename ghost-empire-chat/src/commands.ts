// Built-in custom commands (MVP). Later: managed from /admin#chat via the portal.
type Command = { response: string; cooldownSec: number };

const PORTAL = "https://ghost-empire-web.vercel.app";

export const COMMANDS: Record<string, Command> = {
  "!portal": { response: `Zgarniaj Ghost Tokens: ${PORTAL}`, cooldownSec: 15 },
  "!ranking": { response: `Ranking widzów: ${PORTAL}/ranking`, cooldownSec: 15 },
  "!sklep": { response: `Wydaj GT w sklepie: ${PORTAL}/shop`, cooldownSec: 15 },
  "!questy": { response: `Dzienne questy: ${PORTAL}/quests`, cooldownSec: 15 },
};

const lastUsed = new Map<string, number>();

/** Returns the response if the first word matches a command and it's off cooldown. */
export function matchCommand(message: string): string | null {
  const trigger = message.trim().split(/\s+/)[0]?.toLowerCase();
  if (!trigger) return null;
  const cmd = COMMANDS[trigger];
  if (!cmd) return null;
  const now = Date.now();
  if (now - (lastUsed.get(trigger) ?? 0) < cmd.cooldownSec * 1000) return null;
  lastUsed.set(trigger, now);
  return cmd.response;
}
