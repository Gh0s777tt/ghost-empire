// src/app/api/profile/donation-code/route.ts
// The signed-in user's personal donation code (#audit3) — lazily minted, owner-only. The
// user puts it in their Streamlabs tip message so the donation is VERIFIABLY credited to
// them (see lib/streamlabs matchDonationToUser). Retries on the rare unique collision.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { generateDonationCode } from "@/lib/donation-code";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { donationCode: true } });
  if (me?.donationCode) return NextResponse.json({ code: me.donationCode });

  for (let i = 0; i < 6; i++) {
    const candidate = generateDonationCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { donationCode: candidate } });
      return NextResponse.json({ code: candidate });
    } catch { /* unique collision — try another */ }
  }
  return jsonError("Nie udało się wygenerować kodu", 500);
}
