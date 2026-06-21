"use client";
// src/components/achievements/AchievementsClient.tsx
import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { Award, Lock, Check, Eye, EyeOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, timeAgo, cn } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { achievementProgress, type AchProgress } from "@/lib/achievement-progress";

type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  hidden: boolean;
  triggerType: string | null;
  triggerValue: number | null;
  xpReward: number;
  tokenReward: number;
  globalEarnedCount: number;
  myEarnedAt: string | null;
};

type UserStats = {
  level: number;
  totalEarned: number;
  streak: number;
  messageCount: number;
} | null;

const RARITY_META: Record<
  string,
  {
    label: string;
    short: string;
    border: string;
    bg: string;
    text: string;
    color: string;
    glow: string;
  }
> = {
  common: {
    label: "Pospolite", short: "COMMON",
    border: "border-zinc-700", bg: "bg-zinc-900/40",
    text: "text-zinc-300", color: "#a1a1aa", glow: "",
  },
  rare: {
    label: "Rzadkie", short: "RARE",
    border: "border-blue-700", bg: "bg-blue-950/30",
    text: "text-blue-300", color: "#60a5fa", glow: "shadow-blue-500/10",
  },
  epic: {
    label: "Epickie", short: "EPIC",
    border: "border-purple-700", bg: "bg-purple-950/30",
    text: "text-purple-300", color: "#a855f7", glow: "shadow-purple-500/20",
  },
  legendary: {
    label: "Legendarne", short: "LEGEND",
    border: "border-orange-600", bg: "bg-orange-950/30",
    text: "text-orange-300", color: "#fb923c", glow: "shadow-orange-500/30",
  },
};

const RARITY_ORDER = ["common", "rare", "epic", "legendary"];

export function AchievementsClient({
  achievements,
  totalUsers,
  isAuthenticated,
  userStats,
}: {
  achievements: Achievement[];
  totalUsers: number;
  isAuthenticated: boolean;
  userStats: UserStats;
}) {
  const t = useTranslations("achievements");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "earned" | "locked">(
    "all",
  );
  const [showHidden, setShowHidden] = useState(false);

  const visible = useMemo(() => {
    return achievements.filter((a) => {
      // Hide unearned hidden achievements unless toggle is on
      if (a.hidden && !a.myEarnedAt && !showHidden) return false;
      if (rarityFilter !== "all" && a.rarity !== rarityFilter) return false;
      if (statusFilter === "earned" && !a.myEarnedAt) return false;
      if (statusFilter === "locked" && a.myEarnedAt) return false;
      return true;
    });
  }, [achievements, rarityFilter, statusFilter, showHidden]);

  // Stats
  const earnedCount = achievements.filter((a) => a.myEarnedAt).length;
  const visibleCount = achievements.filter(
    (a) => !a.hidden || a.myEarnedAt,
  ).length;
  const completionPct = visibleCount > 0
    ? Math.round((earnedCount / visibleCount) * 100)
    : 0;
  const xpFromAchievements = achievements
    .filter((a) => a.myEarnedAt)
    .reduce((sum, a) => sum + a.xpReward, 0);
  const tokensFromAchievements = achievements
    .filter((a) => a.myEarnedAt)
    .reduce((sum, a) => sum + a.tokenReward, 0);

  // Per-rarity counts
  const rarityCounts = useMemo(() => {
    const map = new Map<string, { total: number; earned: number }>();
    for (const r of RARITY_ORDER) map.set(r, { total: 0, earned: 0 });
    for (const a of achievements) {
      if (a.hidden && !a.myEarnedAt) continue;
      const entry = map.get(a.rarity);
      if (!entry) continue;
      entry.total++;
      if (a.myEarnedAt) entry.earned++;
    }
    return map;
  }, [achievements]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Award className="w-6 h-6 text-purple-500" />
            <h1
              className="font-display text-4xl text-white tracking-wider"
              style={{ textShadow: "2px 0 0 rgba(168,85,247,0.6), -2px 0 0 rgba(229,9,20,0.4)" }}
            >
              {t("title")}
            </h1>
          </div>
          <p className="text-zinc-500 text-sm">
            {isAuthenticated
              ? t("progressNote", { earned: earnedCount, total: visibleCount, pct: completionPct })
              : t("galleryNote", { count: achievements.length })}
          </p>
          <HowItWorks>{t("help")}</HowItWorks>
        </div>

        {isAuthenticated && (
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-end">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                {t("xpFrom")}
              </div>
              <div className="font-mono text-sm font-bold text-purple-300 tabular-nums">
                +{fmt(xpFromAchievements)} XP
              </div>
            </div>
            <div className="border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-end">
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                {t("gtFrom")}
              </div>
              <div className="font-mono text-sm font-bold text-red-300 tabular-nums">
                +{fmt(tokensFromAchievements)} {tokenSymbol}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rarity filter pills */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setRarityFilter("all")}
            className={cn(
              "px-3 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition-all",
              rarityFilter === "all"
                ? "border-red-500 bg-red-600/15 text-red-300"
                : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:text-zinc-300",
            )}
          >
            {t("allFilter", { count: visibleCount })}
          </button>
          {RARITY_ORDER.map((r) => {
            const meta = RARITY_META[r];
            const counts = rarityCounts.get(r);
            if (!counts) return null;
            const active = rarityFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRarityFilter(r)}
                className={cn(
                  "px-3 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-2",
                  active ? `${meta.border} ${meta.bg} ${meta.text}` : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:text-zinc-300",
                )}
              >
                <span>{meta.short}</span>
                <span className="text-zinc-600 font-mono">
                  {isAuthenticated ? `${counts.earned}/${counts.total}` : counts.total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status filter + hidden toggle */}
        {isAuthenticated && (
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "earned", "locked"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 border text-[9px] font-mono uppercase tracking-widest transition-all",
                  statusFilter === s
                    ? "border-zinc-500 bg-zinc-800 text-white"
                    : "border-zinc-900 bg-zinc-950/50 text-zinc-600 hover:text-zinc-400",
                )}
              >
                {s === "all" ? t("statusAll") : s === "earned" ? t("statusEarned") : t("statusLocked")}
              </button>
            ))}
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="ml-auto px-2.5 py-1 border border-zinc-900 bg-zinc-950/50 text-zinc-600 hover:text-zinc-400 text-[9px] font-mono uppercase tracking-widest flex items-center gap-1.5"
              title={t("hiddenTitle")}
            >
              {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showHidden ? t("hiddenOn") : t("hiddenOff")}
            </button>
          </div>
        )}
      </div>

      {/* Grid — in the "all" view, group by rarity (quality) so the long list reads as
          tiers (#audit3 UX); a specific rarity filter shows a flat grid. */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<Award className="w-6 h-6" />}
          title={t("emptyTitle")}
          message={t("emptyMsg")}
        />
      ) : rarityFilter !== "all" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((a) => (
            <AchievementCard
              key={a.id}
              achievement={a}
              totalUsers={totalUsers}
              isAuthenticated={isAuthenticated}
              progress={achievementProgress(a.triggerType, a.triggerValue, userStats)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {RARITY_ORDER.filter((r) => visible.some((a) => a.rarity === r)).map((r) => {
            const group = visible.filter((a) => a.rarity === r);
            const meta = RARITY_META[r];
            return (
              <div key={r}>
                <div className={cn("flex items-center gap-2 mb-2 pb-1 border-b", meta.border)}>
                  <span className={cn("text-[11px] font-bold tracking-widest uppercase", meta.text)}>{meta.label}</span>
                  <span className="text-[10px] font-mono text-zinc-600">{group.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.map((a) => (
                    <AchievementCard
                      key={a.id}
                      achievement={a}
                      totalUsers={totalUsers}
                      isAuthenticated={isAuthenticated}
                      progress={achievementProgress(a.triggerType, a.triggerValue, userStats)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AchievementCard({
  achievement: a,
  totalUsers,
  isAuthenticated,
  progress,
}: {
  achievement: Achievement;
  totalUsers: number;
  isAuthenticated: boolean;
  progress: AchProgress | null;
}) {
  const t = useTranslations("achievements");
  const locale = useLocale();
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const triggerLabels: Record<string, string> = {
    level: t("trgLevel"),
    tokens_earned: t("trgTokens"),
    streak: t("trgStreak"),
    messages: t("trgMessages"),
    manual: t("trgManual"),
  };
  const meta = RARITY_META[a.rarity] ?? RARITY_META.common;
  const earned = !!a.myEarnedAt;
  const earnedPct = totalUsers > 0
    ? (a.globalEarnedCount / totalUsers) * 100
    : 0;
  const isHidden = a.hidden && !earned;
  const isManual = a.triggerType === "manual" || !a.triggerType;

  return (
    <div
      className={cn(
        "relative border-2 p-4 flex flex-col transition-all",
        earned
          ? `${meta.border} ${meta.bg} ${meta.glow} shadow-md`
          : "border-zinc-900 bg-zinc-950/40",
        !earned && "opacity-90",
      )}
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      {/* Rarity badge top right */}
      <div
        className={cn(
          "absolute top-2 end-2 text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 border",
          earned ? `${meta.border} ${meta.bg} ${meta.text}` : "border-zinc-800 text-zinc-700",
        )}
      >
        {meta.short}
      </div>

      {/* Icon + name */}
      <div className="flex items-start gap-3 mb-2 mt-1">
        <div
          className={cn(
            "text-4xl shrink-0",
            earned ? "" : "grayscale opacity-50",
          )}
        >
          {isHidden ? "❓" : a.icon}
        </div>
        <div className="flex-1 min-w-0 pe-12">
          <h3
            className={cn(
              "text-base font-bold leading-tight",
              earned ? "text-white" : "text-zinc-500",
            )}
          >
            {isHidden ? "???" : a.name}
          </h3>
          <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
            {isHidden ? t("hiddenDesc") : a.description}
          </p>
        </div>
      </div>

      {/* Trigger info */}
      {!isHidden && a.triggerType && a.triggerValue && (
        <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
          <span className="text-zinc-600">{t("reqLabel")}</span>
          <span className="text-zinc-400">
            {triggerLabels[a.triggerType] ?? a.triggerType} ≥ {fmt(a.triggerValue)}
          </span>
        </div>
      )}

      {/* Progress bar (if locked + has progress) */}
      {!earned && !isHidden && progress && !isManual && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest mb-1">
            <span className="text-zinc-600">{t("progress")}</span>
            <span className="text-zinc-400">
              {fmt(Math.min(progress.current, progress.target))} / {fmt(progress.target)}
              <span className="text-zinc-600 ms-1">({progress.pct}%)</span>
            </span>
          </div>
          <div className="h-1.5 bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress.pct}%`,
                background: `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Manual trigger note */}
      {!earned && !isHidden && isManual && (
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">
          {t("manualNote")}
        </div>
      )}

      {/* Rewards + earned status */}
      <div className="mt-auto pt-3 border-t border-zinc-900 flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest">
        <div className="flex items-center gap-2">
          {a.xpReward > 0 && (
            <span className="text-purple-400">+{fmt(a.xpReward)} XP</span>
          )}
          {a.tokenReward > 0 && (
            <span className="text-red-400">+{fmt(a.tokenReward)} {tokenSymbol}</span>
          )}
          {a.xpReward === 0 && a.tokenReward === 0 && (
            <span className="text-zinc-700">{t("noReward")}</span>
          )}
        </div>
        <span
          className="text-zinc-600"
          title={t("earnedByUsers", { count: a.globalEarnedCount, total: totalUsers })}
        >
          {earnedPct < 1 && a.globalEarnedCount > 0
            ? `<1%`
            : a.globalEarnedCount === 0
              ? "0%"
              : `${earnedPct.toFixed(0)}%`}
        </span>
      </div>

      {/* Earned overlay info */}
      {earned && a.myEarnedAt && (
        <div className="absolute top-1.5 start-1.5">
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase"
            style={{ background: meta.color, color: "#000" }}
            title={t("earnedOn", { date: formatDate(a.myEarnedAt, locale) })}
          >
            <Check className="w-2.5 h-2.5" />
            {timeAgo(a.myEarnedAt, locale).toUpperCase()}
          </div>
        </div>
      )}

      {!earned && !isAuthenticated && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity backdrop-blur-[1px]">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Lock className="w-3 h-3" /> {t("loginToTrack")}
          </div>
        </div>
      )}
    </div>
  );
}
