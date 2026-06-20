// src/app/api/support/click/route.ts
// Counts a click/copy on a support method (#541) — directional analytics for the
// streamer ("which tip option do people actually use?"). Public + unauthenticated
// (it's fired from the public /support page), so it's per-IP rate-limited and the
// count is best-effort/directional, not audited. Tenant-scoped increment.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // failClosed:false — a vanity counter must never block on a limiter outage.
  const rl = await rateLimit(`support-click:${ip}`, 40, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const tid = await currentTenantId();
  await prisma.paymentMethod
    .updateMany({ where: { id, ...(tid ? { tenantId: tid } : {}) }, data: { clicks: { increment: 1 } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
