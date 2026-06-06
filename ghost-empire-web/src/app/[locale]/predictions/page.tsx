// src/app/predictions/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { PredictionsClient } from "@/components/predictions/PredictionsClient";
import { lockExpiredPredictions } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Predictions",
  description: "Obstawiaj wydarzenia streamowe za Ghost Tokens — wygrywający dzielą się pulą.",
};

export default async function PredictionsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  await lockExpiredPredictions();

  const [active, recent, me] = await Promise.all([
    prisma.prediction.findMany({
      where: { status: { in: ["open", "locked"] } },
      include: {
        entries: { select: { optionIndex: true, tokensWagered: true, userId: true } },
      },
      orderBy: { opensAt: "desc" },
    }),
    prisma.prediction.findMany({
      where: { status: { in: ["resolved", "cancelled"] } },
      include: userId
        ? { entries: { where: { userId }, select: { optionIndex: true, tokensWagered: true, payout: true } } }
        : undefined,
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } })
      : Promise.resolve(null),
  ]);

  const activePayload = active.map((p) => {
    const perOption = p.options.map((label, idx) => {
      const entries = p.entries.filter((e) => e.optionIndex === idx);
      return {
        index: idx,
        label,
        totalWagered: entries.reduce((s, e) => s + e.tokensWagered, 0),
        wagerCount: entries.length,
      };
    });
    const myEntry = userId ? p.entries.find((e) => e.userId === userId) : null;
    return {
      id: p.id,
      question: p.question,
      status: p.status,
      options: perOption,
      totalPot: p.totalPot,
      accentColor: p.accentColor,
      opensAt: p.opensAt.toISOString(),
      closesAt: p.closesAt?.toISOString() ?? null,
      myEntry: myEntry ? { optionIndex: myEntry.optionIndex, tokensWagered: myEntry.tokensWagered } : null,
    };
  });

  const recentPayload = recent.map((p) => {
    const myEntry =
      userId && "entries" in p && Array.isArray((p as { entries?: unknown }).entries)
        ? ((p as { entries: Array<{ optionIndex: number; tokensWagered: number; payout: number }> }).entries[0] ?? null)
        : null;
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
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <PredictionsClient
          isAuthenticated={!!userId}
          myTokens={me?.tokens ?? 0}
          active={activePayload}
          recent={recentPayload}
        />
      </main>
    </div>
  );
}
