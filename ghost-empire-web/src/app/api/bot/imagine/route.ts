// src/app/api/bot/imagine/route.ts
// Bot → portal: generate an image for !imagine. Bearer BOT_SECRET. Tightly
// rate-limited because image generation costs real money.
import { NextResponse } from "next/server";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { aiImage } from "@/lib/ai";

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { prompt?: string; username?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = String(body.prompt ?? "").trim().slice(0, 300);
  const username = String(body.username ?? "widz").slice(0, 50);
  if (!prompt) return NextResponse.json({ url: null });

  // Max 2 images per user per 5 min, + a global cap to bound cost.
  const userRl = await rateLimit(`ai:imagine:${username.toLowerCase()}`, 2, 5 * 60_000, { failClosed: true });
  if (!userRl.allowed) return NextResponse.json({ url: null, error: "rate_limited" });
  const globalRl = await rateLimit("ai:imagine:global", 30, 60 * 60_000, { failClosed: true });
  if (!globalRl.allowed) return NextResponse.json({ url: null, error: "rate_limited_global" });

  const url = await aiImage(prompt);
  return NextResponse.json({ url });
}
