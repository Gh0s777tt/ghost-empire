// src/app/api/bot/gt-game/route.ts
// Bot → portal: play a GT mini-game (slots/coinflip) for a chatter. Auth: the global
// BOT_SECRET (first-party) OR this portal's per-tenant secret (verifyBotSecretForTenant).
// CURRENCY: these games charge CHIPS (`playGtGame` moves `user.chips`), so every message names
// żetony 🪙 — labelling them with the portal's token symbol would announce a win in the REAL
// currency for money that was never real (docs/CHIPS-CASINO.md). Chips are universal, so the
// label needs no tenant; the %gt% marker must NOT appear here — chat replies are posted
// verbatim, with nothing downstream to resolve it.
// Resolves the chatter to a Ghost Empire user via their linked Connection SCOPED to the
// request's tenant (like chat-award), then plays atomically and returns a ready-to-post message.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecretForTenant } from "@/lib/utils";
import { getCurrentTenantBotAuth } from "@/lib/tenant";
import { CHIP_SYMBOL } from "@/lib/chips";
import { rateLimit } from "@/lib/rate-limit";
import { playGtGame } from "@/lib/gt-games";

export async function POST(req: Request) {
  // Auth + tenant scope from the request Host: a portal's bot can only resolve/play for its
  // own viewers. tenantId null (no request scope) → unscoped (legacy single-tenant behaviour).
  const { id: tenantId, botSecret } = await getCurrentTenantBotAuth();
  if (!verifyBotSecretForTenant(req.headers.get("authorization"), botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Every message below is posted VERBATIM in the streamer's chat, so it must name THIS
  // Jackpot pool is per portal, so the play needs the tenant id (getCurrentTenantBotAuth
  // already resolved the cache()d tenant row — botSecret is kept out
  // of TenantBrand on purpose, which is why this is a second call and not one helper.
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
    return NextResponse.json({ message: `@${body.username ?? "widz"} połącz konto na ${platform} przez !portal, by grać za żetony ${CHIP_SYMBOL}.` });
  }

  const rl = await rateLimit(`gtgame:${connection.userId}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ message: `@${body.username ?? "widz"} za szybko — chwila przerwy.` });

  const result = await playGtGame(connection.userId, game, bet, typeof body.choice === "string" ? body.choice : undefined, tenantId);
  const u = body.username ?? "widz";
  if (!result.ok) return NextResponse.json({ message: `@${u} ${result.error}` });

  const emoji = game === "slots" ? "🎰" : game === "roulette" ? "🎡" : "🪙";
  const bal = result.newBalance.toLocaleString("pl-PL");
  const message = result.payout > 0
    ? `@${u} ${result.detail} — WYGRANA ${result.payout.toLocaleString("pl-PL")} ${CHIP_SYMBOL}! ${emoji} (saldo ${bal})`
    : `@${u} ${result.detail} — pudło, -${result.bet.toLocaleString("pl-PL")} ${CHIP_SYMBOL} (saldo ${bal})`;

  return NextResponse.json({ message, ok: true });
}
