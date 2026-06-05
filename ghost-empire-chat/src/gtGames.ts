// GT mini-games chat commands: !slots <bet>, !coinflip <bet> (alias !gamble). The
// bot calls the portal (Bearer BOT_SECRET); all GT math + atomicity live server-side.
import { env } from "./env";

export function isGtGameTrigger(message: string): boolean {
  return /^!(slots|coinflip|gamble)\b/i.test(message.trim());
}

export async function handleGtGame(
  platform: string,
  platformUserId: string | undefined,
  username: string | undefined,
  message: string,
): Promise<string | null> {
  const u = username ?? "widz";
  const withBet = message.trim().match(/^!(slots|coinflip|gamble)\s+(\d+)/i);
  if (!withBet) {
    const cmd = message.trim().match(/^!(slots|coinflip|gamble)\b/i);
    return cmd ? `@${u} podaj stawkę, np. !${cmd[1].toLowerCase()} 100` : null;
  }
  const game = withBet[1].toLowerCase() === "slots" ? "slots" : "coinflip";
  const bet = parseInt(withBet[2], 10);
  try {
    const r = await fetch(`${env.portalUrl}/api/bot/gt-game`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify({ platform, platformUserId, username, game, bet }),
    });
    const d = r.ok ? ((await r.json()) as { message?: string }) : null;
    return typeof d?.message === "string" ? d.message : null;
  } catch {
    return null;
  }
}
