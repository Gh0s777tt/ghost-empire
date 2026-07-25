// src/app/api/admin/casino-config/route.ts
// Admin-only: the casino's economy knobs for THIS portal. Today that is the size of the free
// daily chips grant (`Tenant.dailyChipsAmount`) — the casino's main faucet, which the owner
// tunes against its sinks (bets, chips cosmetics) using the chips loop in /admin#economy.
//
// Safe to expose to a portal admin: chips are free, non-purchasable and non-cashable, so this
// dial cannot mint anything of value (docs/CHIPS-CASINO.md). It is still bounded and audited.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { DAILY_CHIPS_MAX, DAILY_CHIPS_MIN, normalizeDailyChips } from "@/lib/daily-chips";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenant = await getCurrentTenant();
  return NextResponse.json({
    dailyChipsAmount: tenant.dailyChipsAmount,
    min: DAILY_CHIPS_MIN,
    max: DAILY_CHIPS_MAX,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { dailyChipsAmount?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  if (body.dailyChipsAmount === undefined) {
    return NextResponse.json({ error: "Brak pól do aktualizacji" }, { status: 400 });
  }

  // Reject junk instead of silently clamping it: an owner who typed "abc" (or sent null) must
  // get an error, not a faucet quietly reset to a bound. Note `Number(null)` is 0 — finite —
  // so the type has to be checked before the value.
  const v = body.dailyChipsAmount;
  const settable = typeof v === "number" || (typeof v === "string" && v.trim() !== "");
  const raw = settable ? Number(v) : NaN;
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ error: `Kwota: ${DAILY_CHIPS_MIN}-${DAILY_CHIPS_MAX}` }, { status: 400 });
  }
  const dailyChipsAmount = normalizeDailyChips(raw); // clamps an out-of-range number to a bound

  // Without a host tenant there is no portal row to configure (legacy/unscoped deployment).
  const tid = await currentTenantId();
  if (!tid) return NextResponse.json({ error: "Brak portalu do konfiguracji" }, { status: 404 });

  await prisma.tenant.update({ where: { id: tid }, data: { dailyChipsAmount } });
  await logAdminAction({
    adminId: auth.userId,
    action: "update_casino_config",
    targetType: "tenant",
    targetId: tid,
    details: { dailyChipsAmount },
    req,
  });

  return NextResponse.json({ ok: true, dailyChipsAmount });
}
