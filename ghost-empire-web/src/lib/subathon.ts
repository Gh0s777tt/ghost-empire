// src/lib/subathon.ts
// Subathon timer — a running countdown that subs/gifts/donations extend. Called
// from the same event handlers as stream goals (Twitch/Kick EventSub, Streamlabs,
// YouTube). Fire-and-forget — never roll back the underlying event transaction.
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

/**
 * Extend the running subathon. Subs (incl. gifted — gifts already bump "subs")
 * add `secondsPerSub` each; PLN donated adds `secondsPerPln` per PLN. No-op unless
 * a subathon is active. Honors the optional hard cap (maxEndsAt).
 *
 * `tenantId`: webhook/poller handlers pass the tenant they mapped from the event's
 * broadcaster (or the connection row); omitted → resolve from the request Host.
 */
export async function extendSubathon(opts: { subs?: number; pln?: number }, tenantId?: string | null): Promise<void> {
  try {
    const tid = tenantId === undefined ? await currentTenantId() : tenantId;
    const s = (tid ? await prisma.subathon.findUnique({ where: { tenantId: tid } }) : null)
      ?? await prisma.subathon.findUnique({ where: { id: "default" } });
    if (!s || !s.active || !s.endsAt) return;

    const add = (opts.subs ?? 0) * s.secondsPerSub + (opts.pln ?? 0) * s.secondsPerPln;
    if (add <= 0) return;

    // Base off whichever is later (handles a contribution landing right at expiry).
    const base = Math.max(Date.now(), s.endsAt.getTime());
    let next = new Date(base + add * 1000);
    if (s.maxEndsAt && next > s.maxEndsAt) next = s.maxEndsAt;

    await prisma.subathon.update({
      where: { id: s.id },
      data: { endsAt: next, totalAddedSecs: { increment: add } },
    });
  } catch (e) {
    console.error("[subathon] extend failed:", e);
  }
}
