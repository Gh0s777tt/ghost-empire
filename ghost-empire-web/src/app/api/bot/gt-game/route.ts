// src/app/api/bot/gt-game/route.ts
// Bot → portal: play a casino mini-game (slots/coinflip/roulette) for a chatter. Bearer
// BOT_SECRET. Resolves the chatter to a portal user via their linked Connection (like
// chat-award), then plays atomically and returns a ready-to-post message.
//
// Currency: these games run on CHIPS — the free, non-purchasable casino currency
// (docs/CHIPS-CASINO.md) — so every message here names żetony 🪙. Saying "GT" would announce
// a win in the portal's REAL currency for money that was never real, and would print the
// founder's token symbol into other streamers' chats. Chips are universal, so no tenant
// lookup is needed; the marker convention (%gt%) must NOT be used here — chat replies are
// posted verbatim, with nothing to resolve them.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecret } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { currentTenantId } from "@/lib/tenant";
import { playGtGame } from "@/lib/gt-games";
import { CHIP_SYMBOL } from "@/lib/shop-currency";

export async function POST(req: Request) {
  if (!verifyBotSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

  const connection = body.platformUserId
    ? await prisma.connection.findUnique({
        where: { platform_platformId: { platform, platformId: String(body.platformUserId) } },
        select: { userId: true },
      })
    : body.username
      ? await prisma.connection.findFirst({
          where: { platform, username: { equals: body.username, mode: "insensitive" } },
          select: { userId: true },
        })
      : null;

  if (!connection) {
    return NextResponse.json({ message: `@${body.username ?? "widz"} połącz konto na ${platform} przez !portal, by grać za żetony ${CHIP_SYMBOL}.` });
  }

  const rl = await rateLimit(`gtgame:${connection.userId}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ message: `@${body.username ?? "widz"} za szybko — chwila przerwy.` });

  // Jackpot pool is per portal — the bot plays on behalf of THIS portal's chatter.
  const result = await playGtGame(connection.userId, game, bet, typeof body.choice === "string" ? body.choice : undefined, await currentTenantId());
  const u = body.username ?? "widz";
  if (!result.ok) return NextResponse.json({ message: `@${u} ${result.error}` });

  const emoji = game === "slots" ? "🎰" : game === "roulette" ? "🎡" : "🪙";
  const bal = result.newBalance.toLocaleString("pl-PL");
  const message = result.payout > 0
    ? `@${u} ${result.detail} — WYGRANA ${result.payout.toLocaleString("pl-PL")} ${CHIP_SYMBOL}! ${emoji} (saldo ${bal})`
    : `@${u} ${result.detail} — pudło, -${result.bet.toLocaleString("pl-PL")} ${CHIP_SYMBOL} (saldo ${bal})`;

  return NextResponse.json({ message, ok: true });
}
