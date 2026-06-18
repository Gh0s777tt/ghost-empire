// src/app/api/admin/achievements/route.ts
// Admin CRUD for achievements + manual award to a user. Admin only.
// GET  -> list (with earned counts) + valid rarities/triggerTypes for the UI.
// POST -> action: create | update | delete | award.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, findManagedUser } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { grantManualAchievement } from "@/lib/achievements";
import { currentTenantId } from "@/lib/tenant";

const RARITIES = ["common", "rare", "epic", "legendary"];
const TRIGGER_TYPES = [
  "manual", "level", "streak", "messages", "tokens_earned",
  "donations_count", "donations_amount_pln", "twitch_sub_received", "kick_sub_received",
  "gift_subs_given", "bits_cheered", "super_chats_received", "drops_claimed",
  "events_won", "shop_purchases", "platforms_linked", "yt_member",
];

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const achievements = await prisma.achievement.findMany({
    where: tid ? { tenantId: tid } : {},
    orderBy: [{ createdAt: "desc" }],
    include: { _count: { select: { userAchievements: true } } },
  });

  return NextResponse.json({
    rarities: RARITIES,
    triggerTypes: TRIGGER_TYPES,
    achievements: achievements.map((a) => ({
      id: a.id, code: a.code, name: a.name, description: a.description, icon: a.icon,
      rarity: a.rarity, hidden: a.hidden, triggerType: a.triggerType, triggerValue: a.triggerValue,
      xpReward: a.xpReward, tokenReward: a.tokenReward, rewardNote: a.rewardNote,
      earnedCount: a._count.userAchievements,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

  switch (body.action) {
    case "create": {
      const code = String(body.code ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 50);
      const name = String(body.name ?? "").trim().slice(0, 100);
      if (!code || !name) return NextResponse.json({ error: "Kod i nazwa wymagane" }, { status: 400 });
      const rarity = RARITIES.includes(String(body.rarity)) ? String(body.rarity) : "common";
      const triggerType = TRIGGER_TYPES.includes(String(body.triggerType)) ? String(body.triggerType) : "manual";
      try {
        const created = await prisma.achievement.create({
          data: {
            ...(tid ? { tenantId: tid } : {}),
            code, name,
            description: String(body.description ?? "").slice(0, 500),
            icon: String(body.icon ?? "🏆").slice(0, 16) || "🏆",
            rarity,
            hidden: !!body.hidden,
            triggerType,
            triggerValue: body.triggerValue != null && body.triggerValue !== "" ? num(body.triggerValue) : null,
            xpReward: num(body.xpReward),
            tokenReward: num(body.tokenReward),
            rewardNote: body.rewardNote ? String(body.rewardNote).slice(0, 300) : null,
          },
        });
        await logAdminAction({ adminId: auth.userId, action: "manage_achievements", targetType: "achievement", targetId: created.id, details: { create: code }, req });
        return NextResponse.json({ ok: true, id: created.id });
      } catch (e: unknown) {
        if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
          return NextResponse.json({ error: "Osiągnięcie z tym kodem już istnieje" }, { status: 409 });
        }
        throw e;
      }
    }

    case "update": {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 100);
      if (body.description !== undefined) data.description = String(body.description).slice(0, 500);
      if (body.icon !== undefined) data.icon = String(body.icon).slice(0, 16) || "🏆";
      if (body.rarity !== undefined && RARITIES.includes(String(body.rarity))) data.rarity = String(body.rarity);
      if (body.hidden !== undefined) data.hidden = !!body.hidden;
      if (body.triggerType !== undefined && TRIGGER_TYPES.includes(String(body.triggerType))) data.triggerType = String(body.triggerType);
      if (body.triggerValue !== undefined) data.triggerValue = body.triggerValue != null && body.triggerValue !== "" ? num(body.triggerValue) : null;
      if (body.xpReward !== undefined) data.xpReward = num(body.xpReward);
      if (body.tokenReward !== undefined) data.tokenReward = num(body.tokenReward);
      if (body.rewardNote !== undefined) data.rewardNote = body.rewardNote ? String(body.rewardNote).slice(0, 300) : null;
      if (Object.keys(data).length === 0) return NextResponse.json({ error: "Brak zmian" }, { status: 400 });
      const upd = await prisma.achievement.updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data });
      if (upd.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
      await logAdminAction({ adminId: auth.userId, action: "manage_achievements", targetType: "achievement", targetId: id, details: { update: Object.keys(data) }, req });
      return NextResponse.json({ ok: true });
    }

    case "delete": {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
      // Tenant-guard: only this tenant's achievement (+ its grants) may be removed.
      const ach = await prisma.achievement.findFirst({ where: { id, ...(tid ? { tenantId: tid } : {}) }, select: { id: true } });
      if (!ach) return NextResponse.json({ ok: true });
      // UserAchievement has no cascade to Achievement — remove grants first.
      await prisma.userAchievement.deleteMany({ where: { achievementId: id } });
      await prisma.achievement.delete({ where: { id } }).catch(() => {});
      await logAdminAction({ adminId: auth.userId, action: "manage_achievements", targetType: "achievement", targetId: id, details: { delete: true }, req });
      return NextResponse.json({ ok: true });
    }

    case "award": {
      const target = String(body.target ?? "").trim();
      const code = String(body.code ?? "").trim();
      if (!target || !code) return NextResponse.json({ error: "target + code wymagane" }, { status: 400 });
      const user = await findManagedUser(target, auth);
      if (!user) return NextResponse.json({ error: `User "${target}" nie znaleziony` }, { status: 404 });
      const ok = await grantManualAchievement(user.id, code);
      if (!ok) return NextResponse.json({ error: "Nie przyznano (user już ma to osiągnięcie albo zły kod)" }, { status: 409 });
      await logAdminAction({ adminId: auth.userId, action: "manage_achievements", targetType: "user", targetId: user.id, details: { awarded: code, targetUsername: user.username }, req });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "action: create | update | delete | award" }, { status: 400 });
  }
}
