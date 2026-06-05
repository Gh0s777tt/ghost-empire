// src/app/api/internal/mod-violation/route.ts
// Bot → portal: log an automod violation (after enforcement) for stats + the
// top-offenders view. Bearer BOT_SECRET. Fire-and-forget from the bot's side.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);
const VIOLATIONS = new Set(["profanity", "caps", "length", "repeat", "zalgo"]);
const ACTIONS = new Set(["delete", "timeout", "warn"]);

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { platform?: string; username?: string; violation?: string; action?: string; priorCount?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = String(body.platform ?? "");
  const violation = String(body.violation ?? "");
  const action = String(body.action ?? "");
  if (!PLATFORMS.has(platform) || !VIOLATIONS.has(violation) || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await prisma.modViolationLog.create({
    data: {
      platform,
      username: String(body.username ?? "anon").toLowerCase().slice(0, 100),
      violation,
      action,
      priorCount: Math.max(0, Math.min(10_000, Math.floor(Number(body.priorCount) || 0))),
    },
  });

  return NextResponse.json({ ok: true });
}
