// src/app/api/clans/route.ts
// Clans/teams. GET = my clan + treasury leaderboard. POST actions:
//   create   — found a clan (costs CLAN_CREATE_COST GT, seeds the treasury — a sink)
//   join     — join an existing clan by tag (one clan per user)
//   leave    — members detach; an owner leaving DISBANDS the clan
//   contribute — pour GT into the shared treasury (another sink)
// Tenant-scoped (clans + members resolve within the host tenant). Atomic spends
// mirror shop/buy; the treasury drives the leaderboard.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { CLAN_CREATE_COST, normalizeClanTag, isValidClanTag, isValidClanName, isValidContribution } from "@/lib/clans";

const log = createLogger("clans");

export const dynamic = "force-dynamic";

class ClanError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const MEMBER_SELECT = { id: true, username: true, displayName: true, image: true, level: true, clanRole: true } as const;

async function loadMyClan(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { clanId: true, tokens: true } });
  if (!user?.clanId) return { myClan: null, balance: user?.tokens ?? 0 };
  const clan = await prisma.clan.findUnique({
    where: { id: user.clanId },
    select: {
      id: true, name: true, tag: true, treasury: true, ownerUserId: true,
      members: { select: MEMBER_SELECT, orderBy: { level: "desc" }, take: 100 },
    },
  });
  return { myClan: clan, balance: user.tokens };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const tid = await currentTenantId();

  const [mine, top] = await Promise.all([
    loadMyClan(session.user.id),
    prisma.clan.findMany({
      where: tid ? { tenantId: tid } : {},
      orderBy: { treasury: "desc" },
      take: 20,
      select: { id: true, name: true, tag: true, treasury: true, _count: { select: { members: true } } },
    }),
  ]);

  return NextResponse.json({
    myClan: mine.myClan,
    balance: mine.balance,
    createCost: CLAN_CREATE_COST,
    leaderboard: top.map((c) => ({ id: c.id, name: c.name, tag: c.tag, treasury: c.treasury, members: c._count.members })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  let body: { action?: string; name?: string; tag?: string; amount?: number };
  try { body = await req.json(); } catch { return jsonError("Nieprawidłowe dane", 400); }

  const rl = await rateLimit(`clans:${userId}`, 15, 60_000);
  if (!rl.allowed) return jsonError("Za szybko. Spróbuj za chwilę.", 429, rateLimitHeaders(rl));

  const tid = await currentTenantId();
  try {
    switch (body.action) {
      case "create": return await createClan(userId, tid, body);
      case "join": return await joinClan(userId, tid, body);
      case "leave": return await leaveClan(userId);
      case "contribute": return await contribute(userId, body);
      default: return jsonError("action: create | join | leave | contribute", 400);
    }
  } catch (e) {
    if (e instanceof ClanError) return jsonError(e.message, e.status);
    log.error("clan action error", e);
    return jsonError("Błąd serwera", 500);
  }
}

async function createClan(userId: string, tid: string | null, body: { name?: string; tag?: string }): Promise<NextResponse> {
  const name = (body.name ?? "").trim();
  const tag = normalizeClanTag(body.tag ?? "");
  if (!isValidClanName(name)) throw new ClanError("Nazwa 3–30 znaków", 400);
  if (!isValidClanTag(tag)) throw new ClanError("Tag 2–5 znaków (A–Z, 0–9)", 400);

  await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId }, select: { clanId: true } });
    if (me?.clanId) throw new ClanError("Jesteś już w klanie", 409);

    const taken = await tx.clan.findFirst({ where: { tag, ...(tid ? { tenantId: tid } : {}) }, select: { id: true } });
    if (taken) throw new ClanError("Ten tag jest zajęty", 409);

    const dec = await tx.user.updateMany({
      where: { id: userId, tokens: { gte: CLAN_CREATE_COST } },
      data: { tokens: { decrement: CLAN_CREATE_COST }, totalSpent: { increment: CLAN_CREATE_COST } },
    });
    if (dec.count === 0) throw new ClanError("Za mało Ghost Tokens", 402);

    const clan = await tx.clan.create({ data: { name, tag, ownerUserId: userId, treasury: CLAN_CREATE_COST, ...(tid ? { tenantId: tid } : {}) } });
    await tx.user.update({ where: { id: userId }, data: { clanId: clan.id, clanRole: "owner" } });
    await tx.transaction.create({ data: { userId, type: "spend", amount: -CLAN_CREATE_COST, reason: "clan_create", status: "completed" } });
  });

  return NextResponse.json(await loadMyClan(userId));
}

async function joinClan(userId: string, tid: string | null, body: { tag?: string }): Promise<NextResponse> {
  const tag = normalizeClanTag(body.tag ?? "");
  if (!isValidClanTag(tag)) throw new ClanError("Nieprawidłowy tag", 400);
  await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId }, select: { clanId: true } });
    if (me?.clanId) throw new ClanError("Jesteś już w klanie", 409);
    const clan = await tx.clan.findFirst({ where: { tag, ...(tid ? { tenantId: tid } : {}) }, select: { id: true } });
    if (!clan) throw new ClanError("Klan nie istnieje", 404);
    await tx.user.update({ where: { id: userId }, data: { clanId: clan.id, clanRole: "member" } });
  });
  return NextResponse.json(await loadMyClan(userId));
}

async function leaveClan(userId: string): Promise<NextResponse> {
  await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId }, select: { clanId: true, clanRole: true } });
    if (!me?.clanId) throw new ClanError("Nie jesteś w klanie", 409);
    if (me.clanRole === "owner") {
      // Owner leaving disbands the clan: detach every member, then delete it.
      await tx.user.updateMany({ where: { clanId: me.clanId }, data: { clanId: null, clanRole: null } });
      await tx.clan.delete({ where: { id: me.clanId } }).catch(() => {});
    } else {
      await tx.user.update({ where: { id: userId }, data: { clanId: null, clanRole: null } });
    }
  });
  return NextResponse.json({ ok: true });
}

async function contribute(userId: string, body: { amount?: number }): Promise<NextResponse> {
  const amount = Math.floor(Number(body.amount));
  if (!isValidContribution(amount)) throw new ClanError("Nieprawidłowa ilość GT", 400);
  const result = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUnique({ where: { id: userId }, select: { clanId: true } });
    if (!me?.clanId) throw new ClanError("Nie jesteś w klanie", 409);
    const dec = await tx.user.updateMany({
      where: { id: userId, tokens: { gte: amount } },
      data: { tokens: { decrement: amount }, totalSpent: { increment: amount } },
    });
    if (dec.count === 0) throw new ClanError("Za mało Ghost Tokens", 402);
    const clan = await tx.clan.update({ where: { id: me.clanId }, data: { treasury: { increment: amount } }, select: { treasury: true } });
    await tx.transaction.create({ data: { userId, type: "spend", amount: -amount, reason: "clan_contribute", status: "completed" } });
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true } });
    return { treasury: clan.treasury, balance: fresh?.tokens ?? 0 };
  });
  return NextResponse.json({ ok: true, treasury: result.treasury, newBalance: result.balance });
}
