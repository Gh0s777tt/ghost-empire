// GT mini-games chat commands: !slots <bet>, !coinflip <bet> (alias !gamble),
// !roulette <bet> <red|black|0-36> (alias !roleta). The bot calls the portal
// (Bearer BOT_SECRET); all GT math + atomicity live server-side.
import { env } from "./env";

export function isGtGameTrigger(message: string): boolean {
  return /^!(slots|coinflip|gamble|roulette|roleta)\b/i.test(message.trim());
}

export async function handleGtGame(
  platform: string,
  platformUserId: string | undefined,
  username: string | undefined,
  message: string,
): Promise<string | null> {
  const u = username ?? "widz";
  const m = message.trim().match(/^!(slots|coinflip|gamble|roulette|roleta)\b\s*(.*)$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const rest = m[2].trim();
  const game = cmd === "slots" ? "slots" : cmd === "roulette" || cmd === "roleta" ? "roulette" : "coinflip";

  const betMatch = rest.match(/^(\d+)/);
  if (!betMatch) {
    const hint = game === "roulette" ? `!roulette 100 red (albo black / liczba 0-36)` : `!${cmd} 100`;
    return `@${u} podaj stawkę, np. ${hint}`;
  }
  const bet = parseInt(betMatch[1], 10);
  // Roulette also needs a bet target (red/black/number); default to red if omitted.
  const choice = game === "roulette" ? rest.replace(/^\d+\s*/, "").trim() || "red" : undefined;

  try {
    const r = await fetch(`${env.portalUrl}/api/bot/gt-game`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify({ platform, platformUserId, username, game, bet, choice }),
    });
    const d = r.ok ? ((await r.json()) as { message?: string }) : null;
    return typeof d?.message === "string" ? d.message : null;
  } catch {
    return null;
  }
}
