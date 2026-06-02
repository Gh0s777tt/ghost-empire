// src/app/api/admin/seasons/route.ts
// Admin: view seasons, create reward, edit/delete reward, force-create current season.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { getOrCreateCurrentSeason } from "@/lib/seasons";

const REWARD_TYPES = ["tokens", "badge", "title", "color", "shop_unlock", "item", "code"];

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const seasons = await prisma.season.findMany({
    orderBy: { number: "desc" },
    include: {
      rewards: { orderBy: [{ tier: "asc" }, { premium: "asc" }] },
      _count: { select: { progress: true } },
    },
    take: 12,
  });

  return NextResponse.json({
    rewardTypes: REWARD_TYPES,
    seasons: seasons.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      description: s.description,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      totalTiers: s.totalTiers,
      xpPerTier: s.xpPerTier,
      active: s.active,
      participants: s._count.progress,
      rewards: s.rewards.map((r) => ({
        id: r.id,
        tier: r.tier,
        premium: r.premium,
        type: r.type,
        label: r.label,
        value: r.value,
        icon: r.icon,
      })),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    seasonId?: string;
    rewardId?: string;
    tier?: number;
    premium?: boolean;
    type?: string;
    label?: string;
    value?: string;
    icon?: string;
    name?: string;
    description?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "ensure_current") {
    const season = await getOrCreateCurrentSeason();
    return NextResponse.json({ ok: true, seasonId: season.id, number: season.number, name: season.name });
  }

  if (body.action === "update_season") {
    if (!body.seasonId) return NextResponse.json({ error: "Brak seasonId" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
    if (typeof body.description === "string") patch.description = body.description.slice(0, 1000);
    const updated = await prisma.season.update({ where: { id: body.seasonId }, data: patch });
    return NextResponse.json({ ok: true, season: { id: updated.id, name: updated.name } });
  }

  if (body.action === "add_reward") {
    if (!body.seasonId || typeof body.tier !== "number") {
      return NextResponse.json({ error: "seasonId + tier wymagane" }, { status: 400 });
    }
    if (!body.type || !REWARD_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Niepoprawny type" }, { status: 400 });
    }
    if (!body.label || !body.value) {
      return NextResponse.json({ error: "label + value wymagane" }, { status: 400 });
    }
    const season = await prisma.season.findUnique({ where: { id: body.seasonId } });
    if (!season) return NextResponse.json({ error: "Sezon nie istnieje" }, { status: 404 });
    if (body.tier < 1 || body.tier > season.totalTiers) {
      return NextResponse.json({ error: `Tier 1-${season.totalTiers}` }, { status: 400 });
    }
    try {
      const reward = await prisma.seasonReward.create({
        data: {
          seasonId: body.seasonId,
          tier: body.tier,
          premium: !!body.premium,
          type: body.type,
          label: body.label.slice(0, 120),
          value: body.value.slice(0, 200),
          icon: body.icon?.slice(0, 16) ?? null,
        },
      });
      await logAdminAction({
        adminId: auth.userId,
        action: "set_user_role",
        targetType: "season_reward_add",
        targetId: reward.id,
        details: { tier: reward.tier, type: reward.type, premium: reward.premium },
        req,
      });
      return NextResponse.json({ ok: true, reward });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
        return NextResponse.json({ error: "Nagroda dla tego tieru + track już istnieje" }, { status: 409 });
      }
      throw e;
    }
  }

  if (body.action === "delete_reward") {
    if (!body.rewardId) return NextResponse.json({ error: "Brak rewardId" }, { status: 400 });
    await prisma.seasonReward.delete({ where: { id: body.rewardId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: ensure_current | update_season | add_reward | delete_reward" }, { status: 400 });
}
