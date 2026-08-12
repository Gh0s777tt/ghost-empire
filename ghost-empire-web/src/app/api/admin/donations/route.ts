// src/app/api/admin/donations/route.ts
// Admin reconciliation — manually match unmatched donations to users (PATCH), plus a read-only
// tenant-scoped stats aggregate for the Economy-tab donations header (GET).
import { NextResponse, after } from "next/server";
import { requireAdmin, findManagedUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { gtFromPln } from "@/lib/donation-rate";
import { plnFromMinor, currencyDecimals } from "@/lib/donations/fx";
import { sendDonationReceipt } from "@/lib/email-receipts";
import { claimsForDonation, type QueueDonation } from "@/lib/donation-claim";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin.donations");

/**
 * Close the viewer self-claims that referred to a now-resolved donation (#self-claim).
 * `creditedUserId` (assign) is approved; every other matching pending claim is rejected. On a skip
 * pass null — all matching claims are rejected, so they don't linger invisibly once the row leaves
 * the queue. Best-effort by design: never fails the admin action, but logs so it can't rot silently.
 */
async function resolveClaimsFor(donation: QueueDonation, creditedUserId: string | null): Promise<void> {
  try {
    const pending = await prisma.donationClaim.findMany({
      where: { status: "pending" },
      select: { id: true, userId: true, amountGrosze: true, currency: true, donatedOn: true, evidence: true },
      take: 500,
    });
    const hits = claimsForDonation(donation, pending);
    if (!hits.length) return;
    for (const c of hits) {
      const approved = creditedUserId !== null && c.userId === creditedUserId;
      await prisma.donationClaim.update({
        where: { id: c.id },
        data: { status: approved ? "approved" : "rejected", resolvedAt: new Date(), donationId: donation.id },
      });
    }
  } catch (e) {
    log.warn("failed to resolve donation claims", { donationId: donation.id, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * GET — tenant-scoped donation stats for the Economy-tab header: total value in PLN, donation
 * count, and a per-provider breakdown. Read side of the panel that previously had only the reconcile
 * action (its one function). Mirrors how GET /api/admin/wheel returns a `stats` block. Tenant scope
 * is identical to the PATCH mint path below — a tenant admin only ever sees their own portal's
 * money-in; `tid === null` (legacy/founder caller) intentionally sees the null-tenant legacy rows too.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const scope = tid ? { tenantId: tid } : {};

  // Group by provider+currency so each bucket is FX-converted to PLN with the SAME table the mint
  // rail uses (`plnFromMinor`): `amountGrosze` is minor units of the row's OWN currency, never
  // assumed PLN — summing a $10 Ko-fi tip as 10 PLN would be the exact bug the mint path warns about.
  // An unknown currency is never guessed (plnFromMinor === null): the row still counts, but adds 0
  // PLN, matching lib/donations/fx.ts's "refuse to invent a rate" rule.
  const groups = await prisma.donation.groupBy({
    by: ["source", "currency"],
    where: scope,
    _count: { _all: true },
    _sum: { amountGrosze: true },
  });

  let count = 0;
  let totalPln = 0;
  const byProvider = new Map<string, { count: number; pln: number }>();
  for (const g of groups) {
    const n = g._count._all;
    const pln = plnFromMinor(g._sum.amountGrosze ?? 0, g.currency) ?? 0;
    count += n;
    totalPln += pln;
    const prev = byProvider.get(g.source) ?? { count: 0, pln: 0 };
    byProvider.set(g.source, { count: prev.count + n, pln: prev.pln + pln });
  }

  return NextResponse.json({
    stats: {
      count,
      totalPln: Math.round(totalPln * 100) / 100,
      byProvider: [...byProvider.entries()]
        .map(([source, v]) => ({ source, count: v.count, pln: Math.round(v.pln * 100) / 100 }))
        .sort((a, b) => b.pln - a.pln),
    },
  });
}

// PATCH { donationId, action: "assign", userTarget } | { donationId, action: "skip" }
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { donationId?: string; action?: string; userTarget?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (!body.donationId) return NextResponse.json({ error: "Brak donationId" }, { status: 400 });

  // Batch B: a tenant admin must only touch their own portal's donations (null = legacy/
  // founder, allowed when the caller is also the null/founder tenant).
  const tid = await currentTenantId();
  const donation = await prisma.donation.findUnique({ where: { id: body.donationId } });
  if (!donation || (tid && donation.tenantId !== tid)) return NextResponse.json({ error: "Donejt nie istnieje" }, { status: 404 });
  if (donation.userId) return NextResponse.json({ error: "Już dopasowany" }, { status: 409 });

  if (body.action === "skip") {
    // Mark as reviewed by setting matchType="manual_skip" — keep userId null
    await prisma.donation.update({
      where: { id: body.donationId },
      data: { matchType: "manual_skip", matchedAt: new Date() },
    });
    // A skipped row leaves the queue — reject any claims on it so they don't linger unseen.
    after(() => resolveClaimsFor(donation, null));
    return NextResponse.json({ ok: true, action: "skipped" });
  }

  if (body.action !== "assign") {
    return NextResponse.json({ error: "action: assign | skip" }, { status: 400 });
  }

  const target = body.userTarget?.trim();
  if (!target) return NextResponse.json({ error: "Brak userTarget" }, { status: 400 });

  // Scope the target to the caller's tenant — a tenant admin must not mint GT into
  // another portal's economy by assigning a donation to its user (#440 sweep).
  const user = await findManagedUser(target, auth);

  if (!user) return NextResponse.json({ error: `User "${target}" nie znaleziony` }, { status: 404 });

  // FX-CORRECT MINT. `amountGrosze` is minor units of `donation.currency`, NOT always grosze:
  // dividing by 100 and calling it PLN was wrong in both directions the moment the donation layer
  // admitted multi-currency providers — it under-mints a $10 Ko-fi tip (credited as 10 PLN instead
  // of ~40) and OVER-mints a 5000 RUB DonationAlerts tip by ~20× (credited as 5000 PLN instead of
  // ~220). This manual-match path is a mint rail, so it uses the same FX table as the automatic one.
  const amountPln = plnFromMinor(donation.amountGrosze, donation.currency);
  if (amountPln === null) {
    // An unknown currency is never guessed — see lib/donations/fx.ts. Refusing here is the whole
    // point: a human approving the row must not be the step that invents an exchange rate.
    return NextResponse.json(
      { error: `Nieznana waluta „${donation.currency}" — nie znam jej kursu, więc nie mogę wyliczyć kwoty w GT. Dodaj kurs w lib/donations/fx.ts albo zaksięguj wpłatę ręcznie.` },
      { status: 422 },
    );
  }
  const tokensGranted = gtFromPln(amountPln); // shared rate + cap — this manual-match path is a mint rail too

  // What the supporter actually paid, in the currency they actually paid it in. The receipt and the
  // thank-you notification must show THIS, never the synthetic PLN conversion — printing "40.00 PLN"
  // for a $10 tip would be misleading on what is, to the supporter, a proof of payment.
  const amountCharged = donation.amountGrosze / 10 ** currencyDecimals(donation.currency);

  const matched = await prisma.$transaction(async (tx) => {
    // Atomically claim the donation ONLY if still unmatched — two concurrent "assign"
    // calls can't both credit (B4: where:{id} → where:{id,userId:null}, count===0 → lost).
    const claim = await tx.donation.updateMany({
      where: { id: body.donationId, userId: null },
      data: {
        userId: user.id,
        matchedAt: new Date(),
        matchType: "manual",
        tokensGranted,
      },
    });
    if (claim.count === 0) return false; // another admin assigned it first
    await tx.user.update({
      where: { id: user.id },
      data: {
        isDonator: true,
        totalDonated: { increment: Math.round(amountPln * 100) } /* PLN grosze — NOT the row's own minor
          units: 5000 RUB is ~220 PLN, and recording 500000 would inflate donator tiers ~23× */,
        tokens: { increment: tokensGranted },
        totalEarned: { increment: tokensGranted },
      },
    });
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: "earn",
        amount: tokensGranted,
        // `externalId` is already namespaced by provider (`externalIdFor`), so it carries the real
        // source. Hardcoding "streamlabs" mislabelled every Ko-fi / Tipply / DonationAlerts credit.
        reason: `donation:${donation.externalId}`,
        status: "completed",
        note: donation.message?.slice(0, 500) ?? null,
      },
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        type: "system",
        title: `Dzięki za donację ${amountCharged.toFixed(2)} ${donation.currency}!`,
        message: `Admin dopasował Twoją donację. Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} %gt%.`,
        icon: "❤️",
        link: "/profile",
      },
    });
    return true;
  });
  if (!matched) return NextResponse.json({ error: "Już dopasowany" }, { status: 409 });

  // Close the viewer self-claims that referred to this donation (#self-claim): the claimant who
  // actually got the credit is approved; other pending claims MATCHING THIS ROW are rejected.
  // Off the response path and best-effort — the money above is already committed, and claim
  // bookkeeping must never fail an admin's assign.
  after(() => resolveClaimsFor(donation, user.id));

  // Receipt for the now-credited supporter — off the response path, best-effort (no-op while email
  // is unconfigured). This is the codeless donor finally getting both their currency and a receipt.
  // Amount is rendered in the donation's OWN currency (queue rows are often USD/EUR) — never
  // relabelled as PLN, which would misstate a proof-of-payment document.
  after(() =>
    sendDonationReceipt({
      userId: user.id,
      tenantId: donation.tenantId ?? tid,
      amount: amountCharged,
      currency: donation.currency,
      tokensGranted,
    }),
  );

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "donation",
    targetId: donation.id,
    details: { manualMatch: true, userId: user.id, amount: amountCharged, currency: donation.currency, amountPln, tokens: tokensGranted },
    req,
  });

  return NextResponse.json({ ok: true, user: user.username, tokensGranted });
}
