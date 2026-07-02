// src/app/api/support/click/route.ts
// Counts a click/copy on a support method (#541) — directional analytics for the
// streamer ("which tip option do people actually use?"). Public + unauthenticated
// (it's fired from the public /support page), so it's per-IP rate-limited and the
// count is best-effort/directional, not audited. Tenant-scoped increment.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
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
  // Optional streamer alert on support engagement (#audit3) — best-effort, throttled,
  // never blocks the beacon.
  await fireSupportAlert(tid, id).catch(() => {});
  return NextResponse.json({ ok: true });
}

/** Notify the streamer that a viewer engaged a payment method, per the tenant's
 *  supportAlertMode. Throttled to once per method per 5 min (a click is an intent
 *  signal, not a confirmed payment). bell = in-app notification to the owner;
 *  overlay = a StreamAlert the OBS overlay renders (icon-based, no enabledTypes gate). */
async function fireSupportAlert(tid: string | null, methodId: string): Promise<void> {
  const t = tid
    ? await prisma.tenant.findUnique({ where: { id: tid }, select: { supportAlertMode: true, ownerUserId: true } })
    : null;
  const mode = t?.supportAlertMode ?? "none";
  if (mode === "none") return;

  // Throttle (fail-closed so a limiter outage can't spam): 1 alert / method / 5 min.
  const rl = await rateLimit(`support-alert:${tid ?? "x"}:${methodId}`, 1, 300_000, { failClosed: true });
  if (!rl.allowed) return;

  const method = await prisma.paymentMethod.findUnique({ where: { id: methodId }, select: { label: true } });
  const label = method?.label ?? "wsparcie";

  if ((mode === "bell" || mode === "both") && t?.ownerUserId) {
    await prisma.notification.create({
      data: {
        userId: t.ownerUserId,
        type: "system",
        title: "💜 Aktywność wsparcia",
        message: `Ktoś otworzył Twoją metodę wsparcia: ${label} (możliwe wsparcie).`,
        icon: "💜",
        link: "/admin#payments",
      },
    }).catch(() => {});
  }
  if (mode === "overlay" || mode === "both") {
    // Direct create (bypasses the enabledTypes gate like sound redemptions) — the overlay
    // renders any StreamAlert by its icon.
    await prisma.streamAlert.create({
      data: {
        ...(tid ? { tenantId: tid } : {}),
        type: "support",
        title: "💜 Możliwe wsparcie",
        message: `ktoś korzysta z metody: ${label}`,
        icon: "💜",
      },
    }).catch(() => {});
  }
}
