// src/app/api/admin/reset-database/route.ts
// ⚠️ DANGER: wipes user accounts + their data. Platform-owner only, gated by a typed
// confirmation. KEEPS configuration/catalog (shop, event/achievement/task/drop/season defs,
// chat commands/timers/FAQ, schedule, alert settings, goals/subathon, integrations) + audit log.
// Two scopes (#741): "all" wipes EVERY portal (the original behavior); "tenant" wipes ONE portal —
// so resetting e-forge no longer nukes every other portal's data.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner, requireStepUp } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

const CONFIRM_PHRASE = "USUŃ WSZYSTKO";

// Per-tenant wipe — same "keep config, delete people + their data" intent, scoped to ONE portal.
// Deleting User WHERE tenantId cascades the 28 FK-linked tables + nulls Donation.userId (financial
// records kept). The 4 FK-less per-user tables are scoped via their parent's tenantId; the overlay
// feeds (streamAlert/chatFeedMessage) by their own tenantId. Global-only tables (webhook events,
// rateLimitBucket, discordLinkCode) are SKIPPED — they have no tenantId and don't belong to a portal.
async function wipeTenant(tenantId: string): Promise<number> {
  const deletedUsers = await prisma.user.count({ where: { tenantId } });
  await prisma.$transaction([
    prisma.predictionEntry.deleteMany({ where: { prediction: { tenantId } } }),
    prisma.userSeasonRewardClaim.deleteMany({ where: { reward: { season: { tenantId } } } }),
    prisma.userSeasonProgress.deleteMany({ where: { season: { tenantId } } }),
    prisma.dropClaim.deleteMany({ where: { drop: { tenantId } } }),
    prisma.user.deleteMany({ where: { tenantId } }), // cascades FK-linked tables + Donation SetNull
    prisma.streamAlert.deleteMany({ where: { tenantId } }),
    prisma.chatFeedMessage.deleteMany({ where: { tenantId } }),
    prisma.prediction.updateMany({ where: { tenantId }, data: { totalPot: 0 } }),
  ]);
  return deletedUsers;
}

// Global wipe — every portal. FK-less per-user tables cleared first, then User (cascades), then
// ephemeral feeds/event logs. Donation.userId → null (records kept).
async function wipeEverything(): Promise<number> {
  const deletedUsers = await prisma.user.count();
  await prisma.$transaction([
    prisma.predictionEntry.deleteMany({}),
    prisma.userSeasonRewardClaim.deleteMany({}),
    prisma.userSeasonProgress.deleteMany({}),
    prisma.dropClaim.deleteMany({}),
    prisma.discordLinkCode.deleteMany({}),
    prisma.user.deleteMany({}),
    prisma.streamAlert.deleteMany({}),
    prisma.chatFeedMessage.deleteMany({}),
    prisma.twitchEvent.deleteMany({}),
    prisma.kickEvent.deleteMany({}),
    prisma.youTubeEvent.deleteMany({}),
    prisma.rateLimitBucket.deleteMany({}),
    prisma.prediction.updateMany({ data: { totalPot: 0 } }),
  ]);
  return deletedUsers;
}

export async function POST(req: Request) {
  // Platform-owner ONLY — a per-tenant admin must never wipe any portal (#audit-C1).
  const auth = await requirePlatformOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { confirm?: string; totpCode?: string; scope?: string; tenantId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const scope = body.scope === "tenant" ? "tenant" : "all";

  // Resolve the target portal for a scoped wipe; its SLUG is the confirmation phrase — you must
  // type the exact portal you're deleting (GitHub-style), so you can't nuke the wrong one by reflex.
  let tenant: { id: string; slug: string; name: string } | null = null;
  if (scope === "tenant") {
    const tid = (body.tenantId ?? "").trim();
    if (!tid) return NextResponse.json({ error: "Wybierz portal do skasowania" }, { status: 400 });
    tenant = await prisma.tenant.findUnique({ where: { id: tid }, select: { id: true, slug: true, name: true } });
    if (!tenant) return NextResponse.json({ error: "Portal nie istnieje" }, { status: 404 });
  }

  const expected = scope === "tenant" ? tenant!.slug : CONFIRM_PHRASE;
  if ((body.confirm ?? "").trim() !== expected) {
    return NextResponse.json({ error: `Aby potwierdzić, wpisz dokładnie: ${expected}` }, { status: 400 });
  }

  // Step-up (fail-closed): the single most destructive action — a fresh 2FA code on top of the
  // owner gate (no-op unless 2FA is enabled). On encryption-key drift, BLOCK, don't skip. #audit-W1
  const step = await requireStepUp(auth.userId, body.totpCode, { failClosed: true });
  if (!step.ok) return NextResponse.json({ error: step.error, stepUpRequired: true }, { status: step.status });

  // Snapshot the acting admin's name BEFORE the wipe (their account may be deleted). Also decide
  // whether THIS admin gets wiped (→ the UI signs them out): always for "all"; for a tenant wipe
  // only if their account lives on that portal.
  const adminUser = await prisma.user.findUnique({ where: { id: auth.userId }, select: { username: true, displayName: true, tenantId: true } });
  const adminName = adminUser?.displayName ?? adminUser?.username ?? null;
  const selfDeleted = scope === "all" || adminUser?.tenantId === tenant!.id;

  const deletedUsers = scope === "tenant" ? await wipeTenant(tenant!.id) : await wipeEverything();

  await logAdminAction({
    adminId: auth.userId,
    adminName,
    action: "reset_database",
    targetType: scope === "tenant" ? "tenant" : "system",
    targetId: scope === "tenant" ? tenant!.id : undefined,
    details: { deletedUsers, scope, ...(tenant ? { slug: tenant.slug } : {}) },
    req,
  });

  return NextResponse.json({ ok: true, deletedUsers, selfDeleted, scope });
}
