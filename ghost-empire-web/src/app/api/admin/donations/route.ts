// src/app/api/admin/donations/route.ts
// Admin reconciliation — manually match unmatched donations to users.
import { NextResponse } from "next/server";
import { requireAdmin, findManagedUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";

const GT_PER_PLN = parseInt(process.env.DONATION_GT_PER_PLN ?? "100", 10);

// PATCH { donationId, action: "assign", userTarget } | { donationId, action: "skip" }
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { donationId?: string; action?: string; userTarget?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (!body.donationId) return NextResponse.json({ error: "Brak donationId" }, { status: 400 });

  const donation = await prisma.donation.findUnique({ where: { id: body.donationId } });
  if (!donation) return NextResponse.json({ error: "Donejt nie istnieje" }, { status: 404 });
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
  const tokensGranted = Math.round(amountFloat * GT_PER_PLN);

  await prisma.$transaction([
    prisma.donation.update({
      where: { id: body.donationId },
      data: {
        userId: user.id,
        matchedAt: new Date(),
        matchType: "manual",
        tokensGranted,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        isDonator: true,
        totalDonated: { increment: donation.amountGrosze },
        tokens: { increment: tokensGranted },
        totalEarned: { increment: tokensGranted },
      },
    }),
    prisma.transaction.create({
      data: {
        userId: user.id,
        type: "earn",
        amount: tokensGranted,
        reason: `donation:streamlabs:${donation.externalId}`,
        status: "completed",
        note: donation.message?.slice(0, 500) ?? null,
      },
    }),
    prisma.notification.create({
      data: {
        userId: user.id,
        type: "system",
        title: `Dzięki za donację ${amountFloat.toFixed(2)} ${donation.currency}!`,
        message: `Admin dopasował Twoją donację. Otrzymałeś ${tokensGranted.toLocaleString("pl-PL")} GT.`,
        icon: "❤️",
        link: "/profile",
      },
    }),
  ]);

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
