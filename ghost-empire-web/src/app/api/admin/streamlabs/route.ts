// src/app/api/admin/streamlabs/route.ts
// Manual Streamlabs management — sync now, disconnect.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { pollAndProcessDonations } from "@/lib/streamlabs";
import { getStreamlabsConnection } from "@/lib/platform-tokens";

// POST { action: "sync" | "disconnect" }
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string };
  try { body = await req.json(); } catch { body = {}; }

  if (body.action === "sync") {
    const result = await pollAndProcessDonations();
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "streamlabs_sync",
      details: result,
      req,
    });
    return NextResponse.json(result);
  }

  if (body.action === "disconnect") {
    const conn = await getStreamlabsConnection();
    if (conn) await prisma.streamlabsConnection.delete({ where: { id: conn.id } }).catch(() => {});
    await logAdminAction({
      adminId: auth.userId,
      action: "set_user_role",
      targetType: "streamlabs_disconnect",
      req,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: sync | disconnect" }, { status: 400 });
}
