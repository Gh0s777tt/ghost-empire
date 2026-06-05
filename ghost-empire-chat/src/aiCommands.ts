// AI chat triggers — @bot persona replies + !imagine image generation. The bot calls
// the portal (Bearer BOT_SECRET); the AI key lives server-side, never in the bot.
import { env } from "./env";

async function postJson(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${env.portalUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
      body: JSON.stringify(body),
    });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True when a message should be routed to AI (and skip command matching). */
export function isAiTrigger(message: string): boolean {
  const t = message.trim();
  return /^!imagine\b/i.test(t) || /^@?(?:ghost)?bot[,:\s]+/i.test(t);
}

/** Handle an AI trigger; returns the chat line to post, or null to stay silent. */
export async function handleAiTrigger(username: string | undefined, message: string): Promise<string | null> {
  const u = username ?? "widz";
  const text = message.trim();

  if (/^!imagine\b/i.test(text)) {
    const prompt = text.replace(/^!imagine\b/i, "").trim();
    if (!prompt) return `@${u} podaj opis, np. !imagine duch w neonowym mieście`;
    const d = await postJson("/api/bot/imagine", { prompt, username: u });
    const url = d?.url;
    if (typeof url === "string") return `@${u} 🎨 ${url}`;
    if (typeof d?.error === "string" && d.error.startsWith("rate_limited")) return `@${u} za szybko z obrazkami — daj chwilę.`;
    return `@${u} nie udało się wygenerować obrazka (AI chwilowo niedostępne).`;
  }

  const mention = text.match(/^@?(?:ghost)?bot[,:\s]+(.+)/i);
  if (mention) {
    const prompt = mention[1].trim();
    const d = await postJson("/api/bot/ai-reply", { prompt, username: u });
    const reply = d?.reply;
    return typeof reply === "string" && reply ? `@${u} ${reply}` : null;
  }
  return null;
}
