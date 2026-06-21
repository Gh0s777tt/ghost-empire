// src/app/predictions/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { PredictionsClient } from "@/components/predictions/PredictionsClient";
import { lockExpiredPredictions } from "@/lib/predictions";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "predictions" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/predictions", locale) };
}

export default async function PredictionsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();

  await lockExpiredPredictions();

  const [active, recent, me] = await Promise.all([
    prisma.prediction.findMany({
      where: { status: { in: ["open", "locked"] }, ...(tid ? { tenantId: tid } : {}) },
      select: { id: true, question: true, status: true, options: true, totalPot: true, accentColor: true, opensAt: true, closesAt: true },
      orderBy: { opensAt: "desc" },
    }),
    prisma.prediction.findMany({
      where: { status: { in: ["resolved", "cancelled"] }, ...(tid ? { tenantId: tid } : {}) },
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

  // Tally active predictions via groupBy (sum wagered + count per option) + fetch only the
  // viewer's own entries — instead of loading every PredictionEntry row and reducing in JS
  // (a popular prediction has thousands of entries). Matches the overlay feed. #audit4
  const activeIds = active.map((p) => p.id);
  const [activeTally, myActiveEntries] = await Promise.all([
    activeIds.length
      ? prisma.predictionEntry.groupBy({ by: ["predictionId", "optionIndex"], where: { predictionId: { in: activeIds } }, _sum: { tokensWagered: true }, _count: true })
      : Promise.resolve([] as { predictionId: string; optionIndex: number; _sum: { tokensWagered: number | null }; _count: number }[]),
    userId && activeIds.length
      ? prisma.predictionEntry.findMany({ where: { userId, predictionId: { in: activeIds } }, select: { predictionId: true, optionIndex: true, tokensWagered: true } })
      : Promise.resolve([] as { predictionId: string; optionIndex: number; tokensWagered: number }[]),
  ]);

  const tallyByPred = new Map<string, Map<number, { totalWagered: number; wagerCount: number }>>();
  for (const row of activeTally) {
    let m = tallyByPred.get(row.predictionId);
    if (!m) { m = new Map(); tallyByPred.set(row.predictionId, m); }
    m.set(row.optionIndex, { totalWagered: row._sum.tokensWagered ?? 0, wagerCount: row._count });
  }
  const myEntryByPred = new Map<string, { optionIndex: number; tokensWagered: number }>();
  for (const e of myActiveEntries) if (!myEntryByPred.has(e.predictionId)) myEntryByPred.set(e.predictionId, { optionIndex: e.optionIndex, tokensWagered: e.tokensWagered });

  const activePayload = active.map((p) => {
    const m = tallyByPred.get(p.id);
    const perOption = p.options.map((label, idx) => {
      const t = m?.get(idx);
      return { index: idx, label, totalWagered: t?.totalWagered ?? 0, wagerCount: t?.wagerCount ?? 0 };
    });
    const myEntry = userId ? (myEntryByPred.get(p.id) ?? null) : null;
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
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
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
