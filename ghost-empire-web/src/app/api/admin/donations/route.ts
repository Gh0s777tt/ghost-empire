// src/app/api/admin/donations/route.ts
// Admin reconciliation — manually match unmatched donations to users.
import { NextResponse } from "next/server";
import { requireAdmin, findManagedUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { gtFromPln } from "@/lib/donation-rate";

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

  const amountFloat = donation.amountGrosze / 100;
  const tokensGranted = gtFromPln(amountFloat); // shared rate + cap — this manual-match path is a mint rail too

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
        totalDonated: { increment: donation.amountGrosze },
        tokens: { increment: tokensGranted },
        totalEarned: { increment: tokensGranted },
      },
    });
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: "earn",
        amount: tokensGranted,
        reason: `donation:streamlabs:${donation.externalId}`,
        status: "completed",
        note: donation.message?.slice(0, 500) ?? null,
      },
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        type: "system",
        title: `Dzięki za donację ${amountFloat.toFixed(2)} ${donation.currency}!`,
        message: `Admin dopasował Twoją donację. Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} GT.`,
        icon: "❤️",
        link: "/profile",
      },
    });
    return true;
  });
  if (!matched) return NextResponse.json({ error: "Już dopasowany" }, { status: 409 });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "donation",
    targetId: donation.id,
    details: { manualMatch: true, userId: user.id, amount: amountFloat, tokens: tokensGranted },
    req,
  });

  return NextResponse.json({ ok: true, user: user.username, tokensGranted });
}
