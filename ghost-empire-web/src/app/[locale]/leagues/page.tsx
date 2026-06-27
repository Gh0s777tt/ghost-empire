// src/app/[locale]/leagues/page.tsx
// Prediction Leagues / "Liga Typerów" (#680) — seasonal leaderboard of the best predictors
// + a personal "Wrapped" card. Pure aggregation over resolved prediction entries (no new model).
import { auth } from "@/lib/auth";
import { currentTenantId } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { LeaguesClient } from "@/components/leagues/LeaguesClient";
import { getPredictionLeague, getMyLeagueStats } from "@/lib/prediction-leagues";
import { getHallOfFame } from "@/lib/league-rewards";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "leagues" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/leagues", locale) };
}

export default async function LeaguesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();

  const [league, mine, hallOfFame] = await Promise.all([
    getPredictionLeague(tid, 50),
    userId ? getMyLeagueStats(userId, tid) : Promise.resolve(null),
    getHallOfFame(tid),
  ]);

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <LeaguesClient
          isAuthenticated={!!userId}
          meId={userId}
          season={league.season}
          rows={league.rows}
          mine={mine}
          hallOfFame={hallOfFame}
        />
      </main>
    </div>
  );
}
