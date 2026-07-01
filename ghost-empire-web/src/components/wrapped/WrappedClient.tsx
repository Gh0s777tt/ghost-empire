"use client";
// src/components/wrapped/WrappedClient.tsx
// Season "Wrapped" (#684): a personal monthly recap card. Read-only; data computed
// server-side in lib/wrapped. The "vibe" drives a personalised headline.
import { useTranslations, useLocale } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { Link } from "@/i18n/navigation";
import { Sparkles, Crown, Target, Coins, Trophy, Award, TrendingUp, TrendingDown, Share2 } from "lucide-react";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { useToast } from "@/components/ToastProvider";
import { cn, formatSeasonLabel } from "@/lib/utils";

type WrappedData = {
  season: { number: number; label: string };
  user: { name: string; username: string | null; image: string | null; level: number; prestige: number };
  rank: number | null;
  league: { rank: number; net: number; winRate: number; plays: number } | null;
  bounties: { created: number; backed: number; pledgedGt: number };
  gt: { earned: number; spent: number };
  achievementsThisSeason: number;
  achievementsTotal: number;
  vibe: "legend" | "sharp" | "profit" | "active" | "newcomer";
};

export function WrappedClient({
  data,
  isAuthenticated,
  isPublic = false,
}: {
  data: WrappedData | null;
  isAuthenticated: boolean;
  isPublic?: boolean; // public /wrapped/[username] view — hides the private GT card, adds a CTA
}) {
  const t = useTranslations("wrapped");
  const locale = useLocale();
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const toast = useToast();

  if (!isAuthenticated || !data) {
    return (
      <div className="space-y-6">
        <Heading season={t("noSeason")} />
        <div className="border border-blue-700 bg-blue-950/30 p-4 text-sm text-blue-200">
          {t("loginPrompt")}{" "}
          <Link href="/auth/signin?callbackUrl=/wrapped" className="text-white underline">{t("login")}</Link>
        </div>
      </div>
    );
  }

  async function share() {
    // Self view → share the per-user URL so the crawler renders THIS user's OG card (#691).
    const url =
      !isPublic && data!.user.username
        ? `${window.location.origin}/wrapped/${data!.user.username}`
        : window.location.href;
    const text = t("shareText", { label: formatSeasonLabel(data!.season.number, locale), rank: data!.rank ?? 0 });
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: t("metaTitle"), text, url }); } catch { /* user cancelled */ }
      return;
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast.show("ok", t("shareCopied")); } catch { /* clipboard blocked */ }
  }

  const net = data.league?.net ?? 0;

  return (
    <div className="space-y-6">
      <Heading season={t("season", { label: formatSeasonLabel(data.season.number, locale) })} />
      {!isPublic && <HowItWorks>{t("help")}</HowItWorks>}

      {/* Vibe headline */}
      <section className="relative border border-red-900/60 bg-zinc-950/70 p-6 text-center overflow-hidden card-ghost-red">
        <Sparkles className="w-6 h-6 text-red-500 mx-auto mb-2" />
        <div
          className="font-display text-3xl sm:text-4xl text-white tracking-wide"
          style={{ textShadow: "0 0 24px rgba(229,9,20,0.55)" }}
        >
          {t(`vibe_${data.vibe}`)}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-zinc-400 text-sm">
          {data.user.image ? (
            <img src={data.user.image} alt="" className="w-7 h-7 rounded-full object-cover border border-zinc-700" loading="lazy" decoding="async" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-zinc-800" />
          )}
          <span className="text-white font-bold">{data.user.name}</span>
          <span className="text-zinc-600">·</span>
          <span>{t("level", { n: fmt(data.user.level) })}</span>
          {data.user.prestige > 0 && <span className="text-yellow-500">✦{data.user.prestige}</span>}
        </div>
      </section>

      {/* Stat grid */}
      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard icon={<Trophy className="w-4 h-4 text-yellow-500" />} title={t("rankTitle")}>
          <Big>#{fmt(data.rank ?? 0)}</Big>
          <Sub>{t("rankSub")}</Sub>
        </StatCard>

        <StatCard icon={<Crown className="w-4 h-4 text-yellow-500" />} title={t("leagueTitle")}>
          {data.league ? (
            <>
              <Big>#{fmt(data.league.rank)} <span className="text-sm text-zinc-500">· {Math.round(data.league.winRate * 100)}%</span></Big>
              <Sub className={net >= 0 ? "text-green-400" : "text-red-400"}>
                {net >= 0 ? <TrendingUp className="inline w-3 h-3" /> : <TrendingDown className="inline w-3 h-3" />}{" "}
                {net >= 0 ? "+" : "−"}{fmt(Math.abs(net))} {tokenSymbol} · {fmt(data.league.plays)} {t("bets")}
              </Sub>
            </>
          ) : (
            <Sub>{t("leagueEmpty")}</Sub>
          )}
        </StatCard>

        <StatCard icon={<Target className="w-4 h-4 text-red-500" />} title={t("bountiesTitle")}>
          <Big>{fmt(data.bounties.created)} <span className="text-sm text-zinc-500">/ {fmt(data.bounties.backed)}</span></Big>
          <Sub>{t("bountiesSub", { pledged: fmt(data.bounties.pledgedGt) })}</Sub>
        </StatCard>

        {/* GT flow is private (spent is never shown publicly) → only on the owner's own view. */}
        {!isPublic && (
          <StatCard icon={<Coins className="w-4 h-4 text-yellow-500" />} title={t("gtTitle")}>
            <Big className="text-green-400">+{fmt(data.gt.earned)}</Big>
            <Sub><span className="text-red-400">−{fmt(data.gt.spent)} {tokenSymbol}</span> {t("spentLabel")}</Sub>
          </StatCard>
        )}

        <StatCard icon={<Award className="w-4 h-4 text-purple-400" />} title={t("achievementsTitle")} wide>
          <Big>+{fmt(data.achievementsThisSeason)} <span className="text-sm text-zinc-500">{t("thisSeason")}</span></Big>
          <Sub>{t("achTotal", { total: fmt(data.achievementsTotal) })}</Sub>
        </StatCard>
      </div>

      <button
        onClick={share}
        className="w-full px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase flex items-center justify-center gap-2 glow-red"
      >
        <Share2 className="w-4 h-4" /> {t("share")}
      </button>

      {isPublic && (
        <Link
          href="/wrapped"
          className="block text-center text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400"
        >
          {t("ownCta")}
        </Link>
      )}
    </div>
  );
}

function Heading({ season }: { season: string }) {
  const t = useTranslations("wrapped");
  return (
    <div className="text-center">
      <h1
        className="font-display text-4xl text-white tracking-wider"
        style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
      >
        {t("heading")}
      </h1>
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mt-1">{season}</div>
    </div>
  );
}

function StatCard({ icon, title, children, wide }: { icon: React.ReactNode; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("border border-zinc-800 bg-zinc-950/70 p-4", wide && "sm:col-span-2")}>
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Big({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("font-mono font-bold text-2xl text-white tabular-nums", className)}>{children}</div>;
}
function Sub({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-xs text-zinc-500 mt-0.5", className)}>{children}</div>;
}
