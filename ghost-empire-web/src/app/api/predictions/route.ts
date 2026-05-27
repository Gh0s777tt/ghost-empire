// src/app/api/predictions/route.ts
// Public — lists open + recently-resolved predictions for the /predictions page.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const [active, recent] = await Promise.all([
    prisma.prediction.findMany({
      where: { status: { in: ["open", "locked"] } },
      include: {
        entries: {
          select: { optionIndex: true, tokensWagered: true, userId: true },
        },
      },
      orderBy: { opensAt: "desc" },
    }),
    prisma.prediction.findMany({
      where: { status: { in: ["resolved", "cancelled"] } },
      include: {
        entries: userId
          ? { where: { userId }, select: { optionIndex: true, tokensWagered: true, payout: true } }
          : false,
      },
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    me: userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } }).then((u) => ({ tokens: u?.tokens ?? 0 }))
      : null,
    active: active.map((p) => {
      const myEntry = userId ? p.entries.find((e) => e.userId === userId) : null;
      // Per-option aggregates
      const perOption = p.options.map((label, idx) => {
        const entries = p.entries.filter((e) => e.optionIndex === idx);
        return {
          index: idx,
          label,
          totalWagered: entries.reduce((s, e) => s + e.tokensWagered, 0),
          wagerCount: entries.length,
        };
      });
      return {
        id: p.id,
        question: p.question,
        status: p.status,
        options: perOption,
        totalPot: p.totalPot,
        opensAt: p.opensAt.toISOString(),
        closesAt: p.closesAt?.toISOString() ?? null,
        myEntry: myEntry
          ? { optionIndex: myEntry.optionIndex, tokensWagered: myEntry.tokensWagered }
          : null,
      };
    }),
    recent: recent.map((p) => {
      const myEntry = "entries" in p && Array.isArray(p.entries) ? p.entries[0] : null;
      return {
        id: p.id,
        question: p.question,
        status: p.status,
        options: p.options,
        resolvedOptionIndex: p.resolvedOptionIndex,
        totalPot: p.totalPot,
        resolvedAt: p.resolvedAt?.toISOString() ?? null,
        myResult: myEntry
          ? {
              optionIndex: myEntry.optionIndex,
              tokensWagered: myEntry.tokensWagered,
              payout: myEntry.payout,
              won: myEntry.payout > myEntry.tokensWagered,
            }
          : null,
      };
    }),
  });
}
