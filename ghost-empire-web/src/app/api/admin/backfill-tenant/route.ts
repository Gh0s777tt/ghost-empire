// src/app/api/admin/backfill-tenant/route.ts
// One-shot admin maintenance: attach every NULL-tenantId row to the default tenant.
// Mirrors scripts/backfill-tenant.ts for when the local→DB connection isn't available
// (so the CLI script can't run) but the deployed app (Vercel→DB) reaches the database.
// Idempotent — only touches rows where tenantId IS NULL, so it's safe to run repeatedly.
//
// Primary purpose: users created after the last backfill have tenantId=null and are
// therefore invisible in tenant-scoped queries (e.g. the ranking/leaderboard, which
// filters by tenantId). New users are now attached at signup (lib/auth.ts) and existing
// users self-heal on login; this endpoint fixes everyone at once, including inactive ones.
//
// Trigger (as a logged-in admin on the live site): open the URL in the browser (GET below),
//   or from devtools: await fetch("/api/admin/backfill-tenant", { method: "POST" }).then(r => r.json())
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { SITE } from "@/lib/site";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant";

async function run(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Ensure the default tenant exists (created during the Phase 1 backfill; upsert = idempotent).
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: {
      slug: DEFAULT_TENANT_SLUG,
      name: SITE.name,
      shortName: SITE.shortName,
      brandColor: SITE.brandColor,
    },
  });
  const tenantId = tenant.id;

  // Sequential (not Promise.all): the Supabase free tier has very few connections, so a
  // fan-out of updateMany calls can exhaust the pool. The user table is what fixes the
  // ranking; the rest mirror scripts/backfill-tenant.ts (config singletons + collections).
  const counts: Record<string, number> = {};
  counts.users = (await prisma.user.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.integrationConfig = (await prisma.integrationConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.welcomeConfig = (await prisma.welcomeConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.moderationConfig = (await prisma.moderationConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.botConfig = (await prisma.botConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.wheelConfig = (await prisma.wheelConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.gameLibraryConfig = (await prisma.gameLibraryConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.chatOverlayConfig = (await prisma.chatOverlayConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.codeDropConfig = (await prisma.codeDropConfig.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.subathon = (await prisma.subathon.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.streamScheduleSlot = (await prisma.streamScheduleSlot.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.shopItem = (await prisma.shopItem.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.event = (await prisma.event.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.poll = (await prisma.poll.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.prediction = (await prisma.prediction.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.streamGoal = (await prisma.streamGoal.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.streamDrop = (await prisma.streamDrop.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.streamCode = (await prisma.streamCode.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.achievement = (await prisma.achievement.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  // Phase 4: per-streamer platform credentials
  counts.twitchStreamerToken = (await prisma.twitchStreamerToken.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.kickStreamerToken = (await prisma.kickStreamerToken.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.youTubeStreamerToken = (await prisma.youTubeStreamerToken.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.streamlabsConnection = (await prisma.streamlabsConnection.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  // Phase 4 overlay pass: legacy singletons (id "default" rows gain a tenant)
  counts.streamAlertSettings = (await prisma.streamAlertSettings.updateMany({ where: { id: "default", tenantId: null }, data: { tenantId } })).count;
  counts.hypeTrainState = (await prisma.hypeTrainState.updateMany({ where: { id: "default", tenantId: null }, data: { tenantId } })).count;
  counts.emojiComboState = (await prisma.emojiComboState.updateMany({ where: { id: "default", tenantId: null }, data: { tenantId } })).count;
  // Phase 4 overlay pass: collections
  counts.streamAlert = (await prisma.streamAlert.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.chatFeedMessage = (await prisma.chatFeedMessage.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;
  counts.customWidget = (await prisma.customWidget.updateMany({ where: { tenantId: null }, data: { tenantId } })).count;

  await logAdminAction({
    adminId: gate.userId,
    action: "backfill_tenant",
    targetType: "system",
    details: { tenant: tenant.slug, counts },
    req,
  });

  return NextResponse.json({ ok: true, tenant: tenant.slug, counts });
}

// POST is the canonical verb; GET is also accepted so an admin can trigger the backfill
// by simply opening the URL in a logged-in browser (no console/CSP juggling). Safe here:
// admin-gated (unauthenticated/crawler hits get 403) and fully idempotent.
export async function POST(req: Request) {
  return run(req);
}
export async function GET(req: Request) {
  return run(req);
}
