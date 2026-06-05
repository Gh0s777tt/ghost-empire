// src/app/api/bot/ai-reply/route.ts
// Bot → portal: get an AI persona reply for an @bot chat mention. Bearer BOT_SECRET.
// The AI key stays server-side (Vercel env / IntegrationConfig) — the bot never sees it.
import { NextResponse } from "next/server";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { aiChat, DEFAULT_BOT_PERSONA } from "@/lib/ai";

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { prompt?: string; username?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = String(body.prompt ?? "").trim().slice(0, 500);
  const username = String(body.username ?? "widz").slice(0, 50);
  if (!prompt) return NextResponse.json({ reply: null });

  // Cost/abuse guard — max 5 AI replies per user per minute.
  const rl = await rateLimit(`ai:reply:${username.toLowerCase()}`, 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ reply: null, error: "rate_limited" });

  const reply = await aiChat(
    [
      { role: "system", content: DEFAULT_BOT_PERSONA },
      { role: "user", content: `${username} pisze na czacie: ${prompt}` },
    ],
    { maxTokens: 150 },
  );
  return NextResponse.json({ reply });
}
