// src/app/api/admin/clip-director/route.ts
// AI Clip Director admin (#517): enable + tune hype-clip auto-creation, see recent
// auto-clips, and test a clip now. Admin-only, tenant-scoped. Dormant until the
// streamer's Twitch token has the `clips:edit` scope (shown as a status here).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { getTwitchStreamerToken } from "@/lib/platform-tokens";
import { createAutoClip, invalidateClipDirectorConfig } from "@/lib/clip-director";

export const dynamic = "force-dynamic";

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  const [cfg, clips, streamer] = await Promise.all([
    (tid ? prisma.clipDirectorConfig.findUnique({ where: { tenantId: tid } }) : prisma.clipDirectorConfig.findFirst()).catch(() => null),
    prisma.autoClip.findMany({ where: tid ? { tenantId: tid } : {}, orderBy: { createdAt: "desc" }, take: 10 }).catch(() => []),
    getTwitchStreamerToken(tid).catch(() => null),
  ]);

  return NextResponse.json({
    config: {
      enabled: cfg?.enabled ?? false,
      threshold: cfg?.threshold ?? 10,
      windowSec: cfg?.windowSec ?? 8,
      cooldownSec: cfg?.cooldownSec ?? 120,
    },
    scopeOk: !!streamer?.scope?.split(/\s+/).includes("clips:edit"),
    connected: !!streamer?.broadcasterId,
    clips: clips.map((c) => ({ id: c.id, clipId: c.clipId, editUrl: c.editUrl, reason: c.reason, createdAt: c.createdAt.toISOString() })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }

  if (body.action === "save") {
    const data = {
      enabled: !!body.enabled,
      threshold: clamp(body.threshold, 3, 200, 10),
      windowSec: clamp(body.windowSec, 3, 60, 8),
      cooldownSec: clamp(body.cooldownSec, 30, 1800, 120),
    };
    await prisma.clipDirectorConfig.upsert({
      where: { tenantId: tid ?? "__none__" },
      create: { ...(tid ? { tenantId: tid } : {}), ...data },
      update: data,
    }).catch(async () => {
      const first = await prisma.clipDirectorConfig.findFirst({ select: { id: true } });
      if (first) await prisma.clipDirectorConfig.update({ where: { id: first.id }, data });
      else await prisma.clipDirectorConfig.create({ data });
    });
    invalidateClipDirectorConfig();
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "clip_director", details: data, req });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "test") {
    const clip = await createAutoClip(tid, "manual");
    if (!clip) return NextResponse.json({ error: "no-clip" }, { status: 400 });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "clip_director_test", targetId: clip.clipId, req });
    return NextResponse.json({ ok: true, clip: { clipId: clip.clipId, editUrl: clip.editUrl } });
  }

  return NextResponse.json({ error: "action: save | test" }, { status: 400 });
}
