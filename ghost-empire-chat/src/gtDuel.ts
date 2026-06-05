// PvP duels on GT: !duel <bet> (open) | !duel @user <bet> (targeted) | !accept | !decline.
// The bot only parses + calls the portal (Bearer BOT_SECRET); all GT math + atomicity are
// server-side in lib/duels.ts.
import { env } from "./env";

export function isDuelTrigger(message: string): boolean {
  return /^!(duel|accept|decline)\b/i.test(message.trim());
}

type Parsed =
  | { action: "challenge"; target: string | null; bet: number }
  | { action: "accept" }
  | { action: "decline" }
  | { action: "usage" };

function parse(message: string): Parsed | null {
  const m = message.trim();
  if (/^!accept\b/i.test(m)) return { action: "accept" };
  if (/^!decline\b/i.test(m)) return { action: "decline" };
  const duel = m.match(/^!duel\b\s*(.*)$/i);
  if (!duel) return null;
  const rest = duel[1].trim();
  // "@user 100" or "user 100" → targeted (first token must not be a number)
  const targeted = rest.match(/^@?(\S+)\s+(\d+)$/);
  if (targeted && !/^\d+$/.test(targeted[1])) {
    return { action: "challenge", target: targeted[1], bet: parseInt(targeted[2], 10) };
  }
  // "100" → open challenge
  const open = rest.match(/^(\d+)$/);
  if (open) return { action: "challenge", target: null, bet: parseInt(open[1], 10) };
  return { action: "usage" };
}

export async function handleDuel(
  platform: string,
  platformUserId: string | undefined,
  username: string | undefined,
  message: string,
): Promise<string | null> {
  const u = username ?? "widz";
  const parsed = parse(message);
  if (!parsed) return null;
  if (parsed.action === "usage") {
    return `@${u} pojedynek na GT: !duel 100 (otwarty, każdy może !accept) albo !duel @nick 100, a przeciwnik wpisuje !accept.`;
  }

  const payload: Record<string, unknown> = { platform, platformUserId, username, action: parsed.action };
  if (parsed.action === "challenge") {
    payload.bet = parsed.bet;
    payload.target = parsed.target;
  }

  try {
    const r = await fetch(`${env.portalUrl}/api/bot/duel`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify(payload),
    });
    const d = r.ok ? ((await r.json()) as { message?: string }) : null;
    return typeof d?.message === "string" ? d.message : null;
  } catch {
    return null;
  }
}
