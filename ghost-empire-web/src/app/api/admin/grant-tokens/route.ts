// src/app/api/admin/grant-tokens/route.ts
// Admin grant/deduction, for BOTH ledger currencies: real GT (the tenant's economy) and the
// free casino CHIPS. The two must stay strictly separated — a chips grant may never touch the
// GT lifetime counters or the GT anomaly detector, or a giveaway of a value-less currency
// would show up as real economic activity. See docs/CHIPS-CASINO.md.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, findManagedUser, requireStepUp } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";
import { checkGrantAnomaly } from "@/lib/economy-anomaly";
import { CHIP_SYMBOL, SHOP_CURRENCIES, isChipsCurrency, type ShopCurrency } from "@/lib/shop-currency";

// Grants/deductions at or above this size need a 2FA step-up (for admins who enabled it).
// Deliberately the same threshold for chips: they carry no market value, but a hijacked admin
// session mass-minting them would still distort casino leaderboards and the chips metrics.
const STEP_UP_GRANT_THRESHOLD = 10_000;

export async function POST(req: Request) {
  const auth = await requirePermission("grant_tokens");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { target?: string; amount?: number; reason?: string; totpCode?: string; currency?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const target = body.target?.trim();
  const amount = Math.floor(Number(body.amount ?? 0));
  const reason = (body.reason ?? "admin_grant").trim().slice(0, 200);
  // Default GT keeps every existing caller (and the bot) doing exactly what it did before.
  const currency = (body.currency ?? "GT") as ShopCurrency;
  if (!SHOP_CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: `Currency: ${SHOP_CURRENCIES.join("|")}` }, { status: 400 });
  }
  const isChips = isChipsCurrency(currency);
  // Every user-facing amount in this route is named in the currency it actually moved.
  const unit = isChips ? `żetonów ${CHIP_SYMBOL}` : "GT";

  if (!target) return NextResponse.json({ error: "Brak target (username / Discord ID / ID konta)" }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Amount musi być liczbą != 0" }, { status: 400 });
  }
  if (amount < -1_000_000 || amount > 1_000_000) {
    return NextResponse.json({ error: "Amount musi być w zakresie ±1,000,000" }, { status: 400 });
  }

  // Step-up: a large grant/deduction requires a fresh 2FA code (no-op unless the admin enabled 2FA).
  if (Math.abs(amount) >= STEP_UP_GRANT_THRESHOLD) {
    const step = await requireStepUp(auth.userId, body.totpCode);
    if (!step.ok) return NextResponse.json({ error: step.error, stepUpRequired: true }, { status: step.status });
  }

  // Accept account ID (cuid), username, or Discord ID — scoped to the host
  // tenant (a tenant admin must not move another portal's balances).
  const user = await findManagedUser(target, auth);

  if (!user) {
    return NextResponse.json(
      { error: `User "${target}" nie znaleziony` },
      { status: 404 },
    );
  }

  const currentBalance = isChips ? user.chips : user.tokens;
  if (amount < 0 && currentBalance + amount < 0) {
    return NextResponse.json(
      { error: `User ma tylko ${currentBalance} ${unit}, nie można odjąć ${Math.abs(amount)}` },
      { status: 400 },
    );
  }

  const isGrant = amount > 0;

  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      if (isGrant) {
        // CHIPS move ONLY the chips column: `totalEarned` feeds the real-GT metrics
        // (weekly ranking, economy health), and chips are free — crediting it would
        // invent economic activity out of a giveaway.
        await tx.user.update({
          where: { id: user.id },
          data: isChips
            ? { chips: { increment: amount } }
            : { tokens: { increment: amount }, totalEarned: { increment: amount } },
        });
      } else {
        // Guard the deduction with `gte` so two concurrent deducts can't both pass the
        // stale pre-check above and drive the balance negative. #audit-v2
        const magnitude = Math.abs(amount);
        const dec = await tx.user.updateMany({
          where: isChips
            ? { id: user.id, chips: { gte: magnitude } }
            : { id: user.id, tokens: { gte: magnitude } },
          data: isChips
            ? { chips: { decrement: magnitude } }
            : { tokens: { decrement: magnitude }, totalSpent: { increment: magnitude } },
        });
        if (dec.count === 0) throw new Error("INSUFFICIENT");
      }
      // Stamp the ledger row so the refund/anomaly/ranking readers can tell the two apart.
      await tx.transaction.create({ data: { userId: user.id, type: isGrant ? "admin_grant" : "admin_deduct", amount, reason, currency, status: "completed" } });
      const u = await tx.user.findUnique({ where: { id: user.id }, select: { tokens: true, chips: true } });
      return (isChips ? u?.chips : u?.tokens) ?? 0;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return NextResponse.json({ error: `User ma za mało ${unit}, nie można odjąć ${Math.abs(amount)}` }, { status: 400 });
    }
    return NextResponse.json({ error: "Błąd serwera" }, { status: 500 });
  }

  // Notification + audit in parallel — neither blocks the other (faster response).
  await Promise.all([
    prisma.notification.create({
      data: {
        userId: user.id,
        type: "system",
        title: isGrant
          ? (isChips ? "Otrzymałeś żetony" : "Otrzymałeś tokeny")
          : (isChips ? "Żetony odjęte" : "Tokeny odjęte"),
        message: isGrant
          ? `Admin przyznał Ci ${amount} ${unit} (${reason})`
          : `Admin odjął ${Math.abs(amount)} ${unit} (${reason})`,
        icon: isGrant ? "🎁" : "⚠️",
      },
    }),
    logAdminAction({
      adminId: auth.userId,
      action: "grant_tokens",
      targetType: "user",
      targetId: user.id,
      details: { amount, currency, reason, targetUsername: user.username, newBalance },
      req,
    }),
  ]);

  // Anti-abuse anomaly check (fire-and-forget — never blocks the response). GT only: the
  // detector's thresholds describe the REAL economy, and chips are free by design, so
  // feeding them in would raise false alarms and dull the real one (docs/CHIPS-CASINO.md).
  if (isGrant && !isChips) {
    void checkGrantAnomaly({ adminId: auth.userId, amount, targetUsername: user.username }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, displayName: user.displayName },
    amount,
    currency,
    newBalance,
  });
}
