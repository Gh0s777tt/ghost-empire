// scripts/backfill-tenant.ts
// Phase 1 of the multi-tenant SaaS migration: create the default "Ghost Empire"
// tenant and attach every existing user to it. Idempotent — safe to re-run.
//   npx tsx scripts/backfill-tenant.ts      (reads DATABASE_URL from .env.local / .env)
// Run AFTER `npx prisma db push` (the tenants table + users.tenantId must exist).
export {}; // mark as a module so top-level `main`/`DEFAULT` don't collide with sibling scripts

// Load env BEFORE importing the prisma client — the pg driver adapter reads
// DATABASE_URL at import time (src/lib/prisma.ts), so a dynamic import is required.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (CI / Vercel) — env already injected */
  }
}

// Mirrors src/lib/site.ts — kept inline so the script has no app-alias dependency.
const DEFAULT = { slug: "ghost-empire", name: "GH0ST EMPIRE", shortName: "Ghost Empire", brandColor: "#E50914" };

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT.slug },
    update: {},
    create: { slug: DEFAULT.slug, name: DEFAULT.name, shortName: DEFAULT.shortName, brandColor: DEFAULT.brandColor },
  });
  const { count } = await prisma.user.updateMany({
    where: { tenantId: null },
    data: { tenantId: tenant.id },
  });
  console.log(`✅ default tenant "${tenant.slug}" (${tenant.id}); attached ${count} user(s)`);

  // Phase 5: the default tenant's owner handle (used by the %owner% i18n marker).
  const oh = await prisma.tenant.updateMany({ where: { slug: DEFAULT.slug, ownerHandle: null }, data: { ownerHandle: "Gh0s77tt" } });
  console.log(`   tenant.ownerHandle: set on ${oh.count} row(s)`);

  // Attach the existing config singletons to the default tenant (one row per tenant).
  // Each Phase 3 model that gains a tenantId adds a line here; re-run after its db push.
  const ic = await prisma.integrationConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   integrationConfig: attached ${ic.count} row(s)`);
  const wc = await prisma.welcomeConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   welcomeConfig: attached ${wc.count} row(s)`);
  const mc = await prisma.moderationConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   moderationConfig: attached ${mc.count} row(s)`);
  const bc = await prisma.botConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   botConfig: attached ${bc.count} row(s)`);
  const whc = await prisma.wheelConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   wheelConfig: attached ${whc.count} row(s)`);
  const glc = await prisma.gameLibraryConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   gameLibraryConfig: attached ${glc.count} row(s)`);
  const coc = await prisma.chatOverlayConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   chatOverlayConfig: attached ${coc.count} row(s)`);
  const cdc = await prisma.codeDropConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   codeDropConfig: attached ${cdc.count} row(s)`);
  const sub = await prisma.subathon.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   subathon: attached ${sub.count} row(s)`);
  const sch = await prisma.streamScheduleSlot.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamScheduleSlot: attached ${sch.count} row(s)`);
  const si = await prisma.shopItem.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   shopItem: attached ${si.count} row(s)`);
  const ev = await prisma.event.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   event: attached ${ev.count} row(s)`);
  const pl = await prisma.poll.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   poll: attached ${pl.count} row(s)`);
  const pr = await prisma.prediction.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   prediction: attached ${pr.count} row(s)`);
  const sg = await prisma.streamGoal.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamGoal: attached ${sg.count} row(s)`);
  const sd = await prisma.streamDrop.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamDrop: attached ${sd.count} row(s)`);
  const scd = await prisma.streamCode.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamCode: attached ${scd.count} row(s)`);
  const ach = await prisma.achievement.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   achievement: attached ${ach.count} row(s)`);
  // Phase 4: per-streamer platform credentials (legacy id "default" rows stay; they just gain a tenant)
  const tst = await prisma.twitchStreamerToken.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   twitchStreamerToken: attached ${tst.count} row(s)`);
  const kst = await prisma.kickStreamerToken.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   kickStreamerToken: attached ${kst.count} row(s)`);
  const yst = await prisma.youTubeStreamerToken.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   youTubeStreamerToken: attached ${yst.count} row(s)`);
  const slc = await prisma.streamlabsConnection.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamlabsConnection: attached ${slc.count} row(s)`);
  // Phase 4 overlay pass: legacy singletons (id "default" rows gain a tenant)
  const sas = await prisma.streamAlertSettings.updateMany({ where: { id: "default", tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamAlertSettings: attached ${sas.count} row(s)`);
  const hts = await prisma.hypeTrainState.updateMany({ where: { id: "default", tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   hypeTrainState: attached ${hts.count} row(s)`);
  const ecs = await prisma.emojiComboState.updateMany({ where: { id: "default", tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   emojiComboState: attached ${ecs.count} row(s)`);
  // Phase 4 overlay pass: collections
  const sa = await prisma.streamAlert.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   streamAlert: attached ${sa.count} row(s)`);
  const cfm = await prisma.chatFeedMessage.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   chatFeedMessage: attached ${cfm.count} row(s)`);
  const cw = await prisma.customWidget.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   customWidget: attached ${cw.count} row(s)`);
  const cc = await prisma.chatCommand.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   chatCommand: attached ${cc.count} row(s)`);
  const ct = await prisma.chatTimer.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   chatTimer: attached ${ct.count} row(s)`);
  const fq = await prisma.faqResponse.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   faqResponse: attached ${fq.count} row(s)`);
  const sr = await prisma.songRequest.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   songRequest: attached ${sr.count} row(s)`);
  // #512 customizable-content pass: quests / battle pass / custom alerts / alert-type
  // config / outgoing webhooks become per-portal. Attach legacy rows to the founder.
  const dt = await prisma.dailyTask.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   dailyTask: attached ${dt.count} row(s)`);
  const se = await prisma.season.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   season: attached ${se.count} row(s)`);
  const ca = await prisma.customAlert.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   customAlert: attached ${ca.count} row(s)`);
  const atc = await prisma.alertTypeConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   alertTypeConfig: attached ${atc.count} row(s)`);
  const owh = await prisma.outgoingWebhook.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } });
  console.log(`   outgoingWebhook: attached ${owh.count} row(s)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
