// src/app/api/admin/reset-database/route.ts
// ⚠️ DANGER: wipes ALL user accounts and their data. Admin-only, gated by an exact
// typed confirmation phrase. KEEPS configuration/catalog (shop, event/achievement/
// task/drop/season definitions, chat commands/timers/FAQ, schedule, alert settings,
// stream goals/subathon, Twitch/Kick/YouTube/Streamlabs integrations) and the audit
// log. The owner email becomes admin again on next login (isPermanentAdminEmail in
// lib/auth.ts), which is why wiping every user — including the acting admin — is safe.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

const CONFIRM_PHRASE = "USUŃ WSZYSTKO";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { confirm?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if ((body.confirm ?? "").trim() !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Aby potwierdzić, wpisz dokładnie: ${CONFIRM_PHRASE}` },
      { status: 400 },
    );
  }

  // Snapshot for the audit log BEFORE the wipe — the acting admin's own account is
  // deleted too, so capture the name now. AdminAction has no FK to User, so the
  // entry (and the whole audit history) survives the reset.
  const adminUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { username: true, displayName: true },
  });
  const adminName = adminUser?.displayName ?? adminUser?.username ?? null;
  const deletedUsers = await prisma.user.count();

  // Order matters: tables with a userId column but NO foreign key to User do not
  // cascade on user delete, so we clear them explicitly first. Then deleting users
  // cascades the FK-linked tables (accounts, sessions, connections, transactions,
  // userAchievements, userTasks, socialLinks, eventEntries, raffleTickets,
  // notifications) and nulls Donation.userId (onDelete: SetNull → financial records
  // kept, just unlinked). Finally clear ephemeral feeds / per-user event logs.
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
    // Prediction definitions are kept (config), but their pot referenced now-deleted
    // entries — zero it so the UI isn't stuck with a stale total.
    prisma.prediction.updateMany({ data: { totalPot: 0 } }),
  ]);

  // Log after the wipe (AdminAction survives — no FK to User). adminName captured above.
  await logAdminAction({
    adminId: auth.userId,
    adminName,
    action: "reset_database",
    targetType: "system",
    details: { deletedUsers },
    req,
  });

  return NextResponse.json({ ok: true, deletedUsers });
}
