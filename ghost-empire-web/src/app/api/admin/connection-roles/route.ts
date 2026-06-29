// src/app/api/admin/connection-roles/route.ts
// Flag a user's platform connection (Twitch/Kick/Discord) with sub/mod/VIP status manually
// Will be auto-synced from platforms in Phase 2 via EventSub/webhooks
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, findManagedUser } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

const VALID_PLATFORMS = ["twitch", "kick", "discord", "youtube"];
const VALID_TIERS = ["T1", "T2", "T3", "Prime"];

export const dynamic = "force-dynamic";

// GET — read a connection's CURRENT sub/mod/VIP so the admin card can prefill itself.
// Without this the card opens all-false and the POST below (which writes every flag that is
// `!== undefined`) full-overwrites it — silently wiping the flags the admin never touched
// (#757 → #765). Same gate + tenant scope as POST; `select` returns only the 5 role flags
// and deliberately omits the OAuth tokens that also live on the Connection row.
export async function GET(req: Request) {
  const auth = await requirePermission("mark_subs");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const target = searchParams.get("target")?.trim();
  const platform = searchParams.get("platform")?.trim().toLowerCase();

  if (!target) return NextResponse.json({ error: "Brak target" }, { status: 400 });
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `Platform: ${VALID_PLATFORMS.join("|")}` }, { status: 400 });
  }

  // user-not-found / no-connection are expected while the admin is still typing the target —
  // surface them as `found:false` (200), not an error, so the card stays quiet until a hit.
  const user = await findManagedUser(target, auth);
  if (!user) return NextResponse.json({ found: false });

  const connection = await prisma.connection.findUnique({
    where: { userId_platform: { userId: user.id, platform } },
    select: { isSubscriber: true, subTier: true, subMonths: true, isModerator: true, isVip: true },
  });
  if (!connection) return NextResponse.json({ found: false });

  return NextResponse.json({ found: true, connection });
}

export async function POST(req: Request) {
  const auth = await requirePermission("mark_subs");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    target?: string;
    platform?: string;
    isSubscriber?: boolean;
    subTier?: string;
    subMonths?: number;
    isModerator?: boolean;
    isVip?: boolean;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const target = body.target?.trim();
  const platform = body.platform?.trim().toLowerCase();

  if (!target) return NextResponse.json({ error: "Brak target" }, { status: 400 });
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `Platform: ${VALID_PLATFORMS.join("|")}` }, { status: 400 });
  }

  // Accept account ID (cuid), username, or Discord ID — scoped to the caller's tenant
  // so a moderator of portal A can't flag sub/mod/VIP on a portal-B user (#440 sweep).
  const user = await findManagedUser(target, auth);

  if (!user) {
    return NextResponse.json({ error: `User "${target}" nie znaleziony` }, { status: 404 });
  }

  const connection = await prisma.connection.findUnique({
    where: { userId_platform: { userId: user.id, platform } },
  });

  if (!connection) {
    return NextResponse.json(
      { error: `User nie ma połączonej platformy "${platform}"` },
      { status: 404 },
    );
  }

  if (body.subTier && !VALID_TIERS.includes(body.subTier)) {
    return NextResponse.json({ error: `subTier: ${VALID_TIERS.join("|")}` }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.isSubscriber !== undefined) data.isSubscriber = body.isSubscriber;
  if (body.subTier !== undefined) data.subTier = body.subTier || null;
  if (body.subMonths !== undefined) data.subMonths = Math.max(0, Math.floor(body.subMonths));
  if (body.isModerator !== undefined) data.isModerator = body.isModerator;
  if (body.isVip !== undefined) data.isVip = body.isVip;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Brak pól do aktualizacji" }, { status: 400 });
  }

  // If setting subscriber=true and subStartDate not set yet — set it now
  if (body.isSubscriber === true && !connection.subStartDate) {
    data.subStartDate = new Date();
  }

  const updated = await prisma.connection.update({
    where: { id: connection.id },
    data,
  });

  // Notification + audit in parallel — neither blocks the other (faster response).
  await Promise.all([
    prisma.notification.create({
      data: {
        userId: user.id,
        type: "system",
        title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} status zaktualizowany`,
        message: `Admin zaktualizował Twój status na ${platform}.`,
        icon: "🔗",
        link: "/profile",
      },
    }),
    logAdminAction({
      adminId: auth.userId,
      action: "set_connection_role",
      targetType: "connection",
      targetId: connection.id,
      details: { userId: user.id, platform, ...data },
      req,
    }),
  ]);

  return NextResponse.json({ ok: true, connection: updated });
}
