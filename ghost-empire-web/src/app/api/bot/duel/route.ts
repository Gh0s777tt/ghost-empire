// src/app/api/bot/duel/route.ts
// Bot → portal: PvP duels. Auth: the global BOT_SECRET (first-party) OR this portal's
// per-tenant secret (verifyBotSecretForTenant). Resolves the chatter (and, for a targeted
// challenge, the opponent handle) to Ghost Empire users via their linked Connection SCOPED to
// the request's tenant, then delegates to lib/duels (all chip math + atomicity live there) and
// returns a chat message.
//
// The returned `message` is posted verbatim into a tenant's Twitch/Kick/YouTube chat, so its
// wording is white-label surface: duels stake the FREE casino chips (lib/duels moves `chips`),
// a platform-wide currency separate from the tenant-named %gt% per terms §3 — hence "żetony",
// never "GT". The portal's own NAME, in contrast, IS per-tenant → read from getCurrentTenant().
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyBotSecretForTenant } from "@/lib/utils";
import { getCurrentTenant, getCurrentTenantBotAuth } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { createDuel, acceptDuel, declineDuel } from "@/lib/duels";

const PLATFORMS = new Set(["twitch", "kick", "youtube"]);

// Resolve a chatter/opponent to their Ghost Empire userId via a linked Connection, SCOPED to
// the caller's tenant (tid) so a portal's bot can only duel its own viewers against each other
// — never pull a different tenant's user into a wager. tid null (no request scope) → unscoped
// (legacy). [platform, platformId] is globally unique, so findFirst + the tenant relation
// filter returns the single row only when it belongs here.
async function resolveUserId(tid: string | null, platform: string, platformUserId?: string, username?: string): Promise<string | null> {
  const scopeToTenant = tid ? { user: { tenantId: tid } } : {};
  if (platformUserId) {
    const c = await prisma.connection.findFirst({
      where: { platform, platformId: String(platformUserId), ...scopeToTenant },
      select: { userId: true },
    });
    if (c) return c.userId;
  }
  if (username) {
    const c = await prisma.connection.findFirst({
      where: { platform, username: { equals: username, mode: "insensitive" }, ...scopeToTenant },
      select: { userId: true },
    });
    if (c) return c.userId;
  }
  return null;
}

export async function POST(req: Request) {
  const { id: tenantId, botSecret } = await getCurrentTenantBotAuth();
  if (!verifyBotSecretForTenant(req.headers.get("authorization"), botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    platform?: string;
    platformUserId?: string;
    username?: string;
    action?: string;
    target?: string;
    bet?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = String(body.platform ?? "");
  const action =
    body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : body.action === "challenge" ? "challenge" : null;
  const username = body.username ? String(body.username) : undefined;
  const u = username ?? "widz";
  if (!action || !PLATFORMS.has(platform)) {
    return NextResponse.json({ message: null });
  }

  const selfId = await resolveUserId(tenantId, platform, body.platformUserId, username);
  if (!selfId) {
    return NextResponse.json({ message: `@${u} połącz konto na ${platform} przez !portal, by walczyć o żetony.` });
  }

  // Per-user rate limit shared across duel actions (anti-spam / double-fire).
  const rl = await rateLimit(`duel:${selfId}`, 12, 60_000);
  if (!rl.allowed) return NextResponse.json({ message: `@${u} za szybko — chwila przerwy.` });

  if (action === "accept") {
    const r = await acceptDuel({ platform, accepterId: selfId, accepterName: u });
    return NextResponse.json({ message: r.message, ok: r.ok });
  }
  if (action === "decline") {
    const r = await declineDuel({ platform, accepterId: selfId, accepterName: u });
    return NextResponse.json({ message: r.message, ok: r.ok });
  }

  // challenge
  const bet = Math.floor(Number(body.bet ?? 0));
  let opponentId: string | null = null;
  let opponentName: string | null = null;
  const target = body.target ? String(body.target).replace(/^@/, "").trim() : "";
  if (target) {
    opponentName = target;
    opponentId = await resolveUserId(tenantId, platform, undefined, target);
    if (!opponentId) {
      // THIS portal's name, not the founder's — same cached tenant row as the bot-auth
      // resolve above, so no extra query.
      const { name: brandName } = await getCurrentTenant();
      return NextResponse.json({
        message: `@${u} @${target} nie ma konta ${brandName} na ${platform}. Spróbuj otwartego wyzwania: !duel ${bet || 100}.`,
      });
    }
  }
  const r = await createDuel({ platform, challengerId: selfId, challengerName: u, opponentId, opponentName, bet });
  return NextResponse.json({ message: r.message, ok: r.ok });
}
