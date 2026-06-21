// src/app/games/page.tsx
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { GameVoteButton } from "@/components/games/GameVoteButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "games" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/games", locale) };
}

const SOURCE_LABEL: Record<string, string> = { steam: "Steam", gog: "GOG", psn: "PlayStation", xbox: "Xbox" };

export default async function GamesPage() {
  const t = await getTranslations("games");
  const tid = await currentTenantId();
  const games = await prisma.game.findMany({
    where: { hidden: false, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: [{ playtimeMin: "desc" }, { name: "asc" }],
  });
  const totalHours = Math.round(games.reduce((s, g) => s + g.playtimeMin, 0) / 60);

  // "Vote for the next game" (#audit3): per-portal tally + this viewer's single current pick.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const [tally, myVote] = await Promise.all([
    // Scope the tally to THIS portal — match myVote's scoping (tid → tenantId, else the
    // legacy null-tenant rows). An empty where would aggregate every portal's votes globally.
    prisma.gameVote.groupBy({ by: ["gameId"], where: tid ? { tenantId: tid } : { tenantId: null }, _count: { gameId: true } }),
    userId ? prisma.gameVote.findFirst({ where: { userId, ...(tid ? { tenantId: tid } : { tenantId: null }) }, select: { gameId: true } }) : Promise.resolve(null),
  ]);
  const voteCount = new Map(tally.map((r) => [r.gameId, r._count.gameId]));
  const myGameId = myVote?.gameId ?? null;
  // Most-wanted = the loaded game with the most votes (>0).
  let topGameId: string | null = null;
  let topVotes = 0;
  for (const g of games) {
    const v = voteCount.get(g.id) ?? 0;
    if (v > topVotes) { topVotes = v; topGameId = g.id; }
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #1b2838 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[130px] opacity-10"
          style={{ background: "radial-gradient(circle, #66c0f4 0%, transparent 70%)" }} />
      </div>

      <Header />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white tracking-tight">{t("title")}</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            {games.length > 0
              ? t.rich("countLine", {
                  count: games.length,
                  hours: totalHours.toLocaleString("pl-PL"),
                  b: (chunks) => <span className="text-white font-bold">{chunks}</span>,
                })
              : t("empty")}
          </p>
        </div>

        {games.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {games.map((g) => {
              const votes = voteCount.get(g.id) ?? 0;
              const isTop = g.id === topGameId && topVotes > 0;
              const mine = g.id === myGameId;
              return (
                <div key={g.id} className={`group border bg-zinc-950 overflow-hidden transition-colors ${isTop ? "border-red-600" : "border-zinc-800 hover:border-zinc-600"}`}>
                  <div className="relative">
                    {g.imageUrl ? (
                      <img src={g.imageUrl} alt={g.name} loading="lazy"
                        className="w-full aspect-[460/215] object-cover bg-zinc-900" />
                    ) : (
                      <div className="w-full aspect-[460/215] bg-zinc-900" />
                    )}
                    {isTop && (
                      <span className="absolute top-1 start-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-red-600 text-white">🏆 {t("mostWanted")}</span>
                    )}
                    {votes > 0 && (
                      <span className="absolute top-1 end-1 text-[10px] font-bold px-1.5 py-0.5 bg-black/70 text-white">👍 {votes}</span>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-bold text-white truncate" title={g.name}>{g.name}</div>
                    <div className="text-[10px] text-zinc-500 flex items-center justify-between mt-0.5">
                      <span>{SOURCE_LABEL[g.source] ?? g.source}</span>
                      {g.playtimeMin > 0 && <span className="text-zinc-400">{Math.round(g.playtimeMin / 60)}h</span>}
                    </div>
                    {userId && <GameVoteButton gameId={g.id} voted={mine} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
