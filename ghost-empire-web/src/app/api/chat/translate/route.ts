// src/app/api/chat/translate/route.ts
// AI chat translation (#547) — the chat overlay posts a message + target language and
// gets back a translation (or null). DORMANT until an AI key is configured (aiChat
// returns null → {translated:null}). Per-IP rate-limited and cached (identical
// message+target served from cache) to bound AI cost. Off the chat ingest hot path.
import { NextResponse } from "next/server";
import { aiChat } from "@/lib/ai";
import { cacheJson } from "@/lib/redis";
import { rateLimit } from "@/lib/rate-limit";
import { shouldTranslate, langName, buildTranslatePrompt } from "@/lib/chat-translate";

export const dynamic = "force-dynamic";

const MAX_LEN = 500;
const CACHE_MS = 10 * 60_000;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`chat-tr:${ip}`, 300, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ translated: null, reason: "rate-limited" }, { status: 429 });

  let body: { text?: string; target?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ translated: null }, { status: 400 }); }

  const text = String(body.text ?? "").slice(0, MAX_LEN);
  const target = String(body.target ?? "").toLowerCase().slice(0, 5);
  if (!target || !shouldTranslate(text)) return NextResponse.json({ translated: null });

  const targetName = langName(target);
  const out = await cacheJson<string | null>(`chattr:${target}:${text}`, CACHE_MS, async () => {
    const r = await aiChat([{ role: "user", content: buildTranslatePrompt(text, targetName) }], { maxTokens: 200, temperature: 0 });
    return (r ?? "").trim() || null;
  }).catch(() => null);

  return NextResponse.json({ translated: out });
}
