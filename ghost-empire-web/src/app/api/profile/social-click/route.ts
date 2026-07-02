// src/app/api/profile/social-click/route.ts
// Counts a click on a public profile's social link (#542) — "which of my links do
// visitors actually open?" Public + unauthenticated (fired from /u/<name>), so it's
// per-IP rate-limited and the count is directional, not audited. Increment by link id.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { currentTenantId } from "@/lib/tenant";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`social-click:${ip}`, 60, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  // SECURITY: scope the increment to a link whose owner is in THIS portal, so a raw id
  // can't bump (or cross-tenant forge) an arbitrary user's link analytics. Mirrors the
  // support/click route. #audit-H2.
  const tid = await currentTenantId();
  await prisma.socialLink
    .updateMany({ where: { id, ...(tid ? { user: { tenantId: tid } } : {}) }, data: { clicks: { increment: 1 } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
