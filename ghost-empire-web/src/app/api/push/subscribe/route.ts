// src/app/api/push/subscribe/route.ts
// Stores a browser's push subscription for the logged-in user (#533). Keyed by the
// endpoint (natural unique) so re-subscribing upserts. Tenant-scoped so a viewer
// only gets pushes from the portal they subscribed on. Graceful "not-ready" before
// the table is migrated.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey || endpoint.length > 1000) {
    return NextResponse.json({ error: "bad-subscription" }, { status: 400 });
  }

  const tid = await currentTenantId();
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 200) || null;

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      // Re-stamp userId on update too: a shared browser may switch accounts and the
      // endpoint should follow the current owner.
      create: { endpoint, p256dh, auth: authKey, userId: session.user.id, tenantId: tid, userAgent },
      update: { p256dh, auth: authKey, userId: session.user.id, tenantId: tid, userAgent },
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "not-ready" });
  }
  return NextResponse.json({ ok: true });
}
