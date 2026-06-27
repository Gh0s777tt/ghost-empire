"use client";
// src/components/leagues/LeaguesClient.tsx
// Prediction Leagues / "Liga Typerów" (#680): a seasonal leaderboard of the best predictors
// + a personal "Wrapped" card. Read-only — all data derived from resolved prediction entries.
import { useTranslations, useLocale } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { Link } from "@/i18n/navigation";
import { Crown, TrendingUp, TrendingDown, Target, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { cn, formatSeasonLabel } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";

type Row = {
  userId: string;
  rank: number;
  name: string;
  image: string | null;
  winRate: number;
  net: number;
  plays: number;
  wins: number;
  wagered: number;
  biggestWin: number;
};
type Mine = {
  rank: number;
  winRate: number;
  net: number;
  plays: number;
  wins: number;
  wagered: number;
  biggestWin: number;
};
type HofSeason = {
  seasonNumber: number;
  seasonLabel: string;
  podium: Array<{ rank: number; name: string; image: string | null; prize: number; net: number }>;
};

const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaguesClient({
  isAuthenticated, meId, season, rows, mine, hallOfFame,
}: {
  isAuthenticated: boolean;
  meId: string | null;
  season: { number: number; label: string };
  rows: Row[];
  mine: Mine | null;
  hallOfFame: HofSeason[];
}) {
  const t = useTranslations("leagues");
  const locale = useLocale();
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Crown className="w-7 h-7 text-yellow-500" />
          <h1
            className="font-display text-4xl text-white tracking-wider"
            style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
          >
            {t("heading")}
          </h1>
          <span className="ms-1 text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300">
            {t("season", { label: formatSeasonLabel(season.number, locale) })}
          </span>
        </div>
        <p className="text-zinc-500 text-sm max-w-2xl">{t("subtitle")}</p>
        <HowItWorks>{t("help")}</HowItWorks>
      </div>

      {!isAuthenticated && (
        <div className="border border-blue-700 bg-blue-950/30 p-4 text-sm text-blue-200">
          {t("loginPrompt")}{" "}
          <Link href="/auth/signin?callbackUrl=/leagues" className="text-white underline">{t("login")}</Link>
        </div>
      )}

      {/* Personal "Wrapped" card */}
      {isAuthenticated && (
        mine ? (
          <section className="border border-red-900/60 bg-zinc-950/70 p-5 card-ghost-red">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
              <Sparkles className="w-4 h-4 text-red-500" />
              {t("yourSeason")}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label={t("rank")} value={`#${fmt(mine.rank)}`} accent="text-yellow-400" />
              <Stat label={t("winRate")} value={`${Math.round(mine.winRate * 100)}%`} sub={t("winsOf", { wins: fmt(mine.wins), plays: fmt(mine.plays) })} />
              <Stat
                label={t("net")}
                value={`${mine.net >= 0 ? "+" : "−"}${fmt(Math.abs(mine.net))}`}
                accent={mine.net >= 0 ? "text-green-400" : "text-red-400"}
                sub={tokenSymbol}
              />
              <Stat label={t("biggestWin")} value={mine.biggestWin > 0 ? `+${fmt(mine.biggestWin)}` : "—"} accent="text-green-400" sub={mine.biggestWin > 0 ? tokenSymbol : undefined} />
            </div>
          </section>
        ) : (
          <div className="border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400 flex items-center gap-2">
            <Target className="w-4 h-4 text-zinc-500" />
            {t("noStats")}{" "}
            <Link href="/predictions" className="text-white underline">{t("toPredictions")}</Link>
          </div>
        )
      )}

      {/* Leaderboard */}
      <section>
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Crown className="w-5 h-5 text-yellow-500" />
          {t("tableTitle", { label: formatSeasonLabel(season.number, locale) })}
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={<Crown className="w-6 h-6" />} title={t("empty")} message={t("emptyMsg")} />
        ) : (
          <div className="border border-zinc-800 divide-y divide-zinc-800/70">
            {/* header */}
            <div className="hidden sm:grid grid-cols-[3rem_1fr_5rem_7rem_4rem] gap-2 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500 bg-zinc-950/60">
              <span>{t("colRank")}</span>
              <span>{t("colPlayer")}</span>
              <span className="text-end">{t("colWinRate")}</span>
              <span className="text-end">{t("colNet")}</span>
              <span className="text-end">{t("colPlays")}</span>
            </div>
            {rows.map((r) => {
              const isMe = r.userId === meId;
              return (
                <div
                  key={r.userId}
                  className={cn(
                    "grid grid-cols-[2.5rem_1fr_5rem] sm:grid-cols-[3rem_1fr_5rem_7rem_4rem] gap-2 px-3 py-2.5 items-center text-sm",
                    isMe ? "bg-red-950/25" : "bg-black/20",
                  )}
                >
                  <span className="font-mono tabular-nums text-zinc-400">
                    {r.rank <= 3 ? <span className="text-base">{MEDAL[r.rank - 1]}</span> : `#${r.rank}`}
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    {r.image ? (
                      <img src={r.image} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 border border-zinc-700" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-zinc-800 shrink-0" />
                    )}
                    <span className={cn("truncate", isMe ? "text-white font-bold" : "text-zinc-200")}>{r.name}</span>
                    {isMe && (
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-red-700 bg-red-950/40 text-red-300 shrink-0">
                        {t("you")}
                      </span>
                    )}
                  </span>
                  <span className="text-end font-mono tabular-nums text-zinc-300">{Math.round(r.winRate * 100)}%</span>
                  <span className={cn("hidden sm:flex justify-end items-center gap-1 font-mono tabular-nums", r.net >= 0 ? "text-green-400" : "text-red-400")}>
                    {r.net >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {r.net >= 0 ? "+" : "−"}{fmt(Math.abs(r.net))}
                  </span>
                  <span className="hidden sm:block text-end font-mono tabular-nums text-zinc-500">{fmt(r.plays)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Hall of Fame — past season podiums */}
      {hallOfFame.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            {t("hofTitle")}
          </h2>
          <div className="space-y-3">
            {hallOfFame.map((s) => (
              <div key={s.seasonNumber} className="border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{formatSeasonLabel(s.seasonNumber, locale)}</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {s.podium.map((p) => (
                    <div key={p.rank} className="flex items-center gap-2 border border-zinc-800/70 bg-black/20 px-2 py-1.5">
                      <span className="text-base shrink-0">{MEDAL[p.rank - 1] ?? `#${p.rank}`}</span>
                      {p.image ? (
                        <img src={p.image} alt="" className="w-5 h-5 rounded-full object-cover border border-zinc-700 shrink-0" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-zinc-800 shrink-0" />
                      )}
                      <span className="text-zinc-200 text-sm truncate flex-1">{p.name}</span>
                      {p.prize > 0 && <span className="text-[10px] font-mono text-yellow-500 shrink-0">+{fmt(p.prize)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="border border-zinc-800 bg-black/30 p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={cn("font-mono font-bold text-xl tabular-nums mt-1", accent ?? "text-white")}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}
