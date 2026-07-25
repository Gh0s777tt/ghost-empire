// src/app/api/bot/gt-game/route.ts
// Bot → portal: play a GT mini-game (slots/coinflip) for a chatter. Auth: the global
// BOT_SECRET (first-party) OR this portal's per-tenant secret (verifyBotSecretForTenant).
// Resolves the chatter to a Ghost Empire user via their linked Connection SCOPED to the
// request's tenant (like chat-award), then plays atomically and returns a ready-to-post message.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecretForTenant } from "@/lib/utils";
import { getCurrentTenantBotAuth, getCurrentTenant } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { playGtGame } from "@/lib/gt-games";

export async function POST(req: Request) {
  // Auth + tenant scope from the request Host: a portal's bot can only resolve/play for its
  // own viewers. tenantId null (no request scope) → unscoped (legacy single-tenant behaviour).
  const { id: tenantId, botSecret } = await getCurrentTenantBotAuth();
  if (!verifyBotSecretForTenant(req.headers.get("authorization"), botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The `message` below is posted VERBATIM to this portal's Twitch/Kick/YouTube chat, so it
  // must name THIS tenant's currency — a literal "GT" here leaks the founder brand into every
  // sub-portal's chat exactly like a hardcoded string in the bot would. Free: getCurrentTenant()
  // is cache()d and shares the row lookup getCurrentTenantBotAuth() just did (no extra query).
  const { tokenName, tokenSymbol } = await getCurrentTenant();
  let body: { platform?: string; platformUserId?: string; username?: string; game?: string; bet?: number; choice?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = String(body.platform ?? "");
  const game =
    body.game === "coinflip" ? "coinflip" :
    body.game === "slots" ? "slots" :
    body.game === "roulette" ? "roulette" : null;
  const bet = Math.floor(Number(body.bet ?? 0));
  if (!game) return NextResponse.json({ message: null });

  const scopeToTenant = tenantId ? { user: { tenantId } } : {};
  const connection = body.platformUserId
    ? await prisma.connection.findFirst({
        where: { platform, platformId: String(body.platformUserId), ...scopeToTenant },
        select: { userId: true },
      })
    : body.username
      ? await prisma.connection.findFirst({
          where: { platform, username: { equals: body.username, mode: "insensitive" }, ...scopeToTenant },
          select: { userId: true },
        })
      : null;

  if (!connection) {
    return NextResponse.json({ message: `@${body.username ?? "widz"} połącz konto na ${platform} przez !portal, by grać za ${tokenName}.` });
  }

  const rl = await rateLimit(`gtgame:${connection.userId}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ message: `@${body.username ?? "widz"} za szybko — chwila przerwy.` });

  const result = await playGtGame(connection.userId, game, bet, typeof body.choice === "string" ? body.choice : undefined);
  const u = body.username ?? "widz";
  if (!result.ok) return NextResponse.json({ message: `@${u} ${result.error}` });

  const emoji = game === "slots" ? "🎰" : game === "roulette" ? "🎡" : "🪙";
  const bal = result.newBalance.toLocaleString("pl-PL");
  // Symbol (not the full name) — it sits directly after an amount.
  const message = result.payout > 0
    ? `@${u} ${result.detail} — WYGRANA ${result.payout.toLocaleString("pl-PL")} ${tokenSymbol}! ${emoji} (saldo ${bal})`
    : `@${u} ${result.detail} — pudło, -${result.bet.toLocaleString("pl-PL")} ${tokenSymbol} (saldo ${bal})`;

  return NextResponse.json({ message, ok: true });
}
