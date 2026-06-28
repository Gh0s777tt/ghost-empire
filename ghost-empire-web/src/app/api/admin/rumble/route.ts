// src/app/api/admin/rumble/route.ts
// Per-tenant Rumble config (#730): the streamer stores their Rumble Livestream API URL (with
// the embedded key) — used by the /overlay/rumble overlay + the live-status display here.
// GET returns whether a URL is set + the current live status; POST saves/clears the URL.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { encryptSecret } from "@/lib/crypto";
import { logAdminAction } from "@/lib/audit";
import { getRumbleStatus } from "@/lib/rumble";

export const dynamic = "force-dynamic";

/** This tenant's IntegrationConfig row (created on demand), or the legacy "default" singleton. */
async function getCfg() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.integrationConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.integrationConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.integrationConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const [cfg, status] = await Promise.all([getCfg(), getRumbleStatus(tid)]);
  return NextResponse.json({ hasUrl: !!cfg.rumbleApiUrl, status });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { rumbleApiUrl?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const row = await getCfg();
  // null clears; a non-empty https URL sets it (encrypted); absent leaves it untouched.
  let val: string | null | undefined = undefined;
  if (body.rumbleApiUrl === null) {
    val = null;
  } else if (typeof body.rumbleApiUrl === "string" && body.rumbleApiUrl.trim()) {
    const url = body.rumbleApiUrl.trim();
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Podaj poprawny URL (https://…)" }, { status: 400 });
    val = encryptSecret(url.slice(0, 1000));
  }
  if (val !== undefined) {
    await prisma.integrationConfig.update({ where: { id: row.id }, data: { rumbleApiUrl: val } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "rumble", targetId: "rumble", req });
  }
  return NextResponse.json({ ok: true });
}
