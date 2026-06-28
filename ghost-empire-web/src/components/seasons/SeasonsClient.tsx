"use client";
// src/components/seasons/SeasonsClient.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { Link } from "@/i18n/navigation";
import { Ticket, Lock, Check, Loader2, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ToastProvider";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { apiPost, ApiError } from "@/lib/api-client";

type Reward = {
  id: string;
  tier: number;
  premium: boolean;
  type: string;
  label: string;
  icon: string | null;
  claimed: boolean;
};

type Season = {
  number: number;
  name: string;
  description: string | null;
  endsAt: string;
  totalTiers: number;
  xpPerTier: number;
};

export function SeasonsClient({
  isAuthenticated, season, userXp, userTier, isPremium, rewards,
}: {
  isAuthenticated: boolean;
  season: Season;
  userXp: number;
  userTier: number;
  isPremium: boolean;
  rewards: Reward[];
}) {
  const t = useTranslations("seasons");
  const fmt = useLocaleFmt();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const showToast = toast.show;

  async function claim(rewardId: string) {
    setBusy(rewardId);
    try {
      const data = await apiPost<{ tokens?: number; label: string }>("/api/seasons/claim", { rewardId });
      showToast("ok", data.tokens ? t("claimedTokens", { tokens: fmt(data.tokens), label: data.label }) : t("claimedItem", { label: data.label }));
      startTransition(() => router.refresh());
    } catch (err) {
      showToast("err", err instanceof ApiError ? err.message : t("err"));
    } finally {
      setBusy(null);
    }
  }

  // XP within current tier
  const xpIntoTier = userXp % season.xpPerTier;
  const tierPct = Math.min(100, (xpIntoTier / season.xpPerTier) * 100);
  // eslint-disable-next-line react-hooks/purity -- harmless render-time Date.now() for a days-left display (non-ticking); compiler bails out safely (#733)
  const daysLeft = Math.max(0, Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / 86_400_000));

  // Group rewards by tier for the track display
  const maxTier = season.totalTiers;
  const byTier = new Map<number, Reward[]>();
  for (const r of rewards) {
    if (!byTier.has(r.tier)) byTier.set(r.tier, []);
    byTier.get(r.tier)!.push(r);
  }
  const tiersWithRewards = [...byTier.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Ticket className="w-7 h-7 text-red-500" />
          <h1
            className="font-display text-4xl text-white tracking-wider"
            style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
          >
            BATTLE PASS
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className="text-white font-bold">{season.name}</span>
          <span className="text-zinc-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {t("daysLeft", { days: daysLeft })}
          </span>
        </div>
        {season.description && <p className="text-zinc-500 text-sm mt-1">{season.description}</p>}
        <HowItWorks>{t("help")}</HowItWorks>
      </div>

      {!isAuthenticated && (
        <div className="border border-blue-700 bg-blue-950/30 p-4 text-sm text-blue-200">
          {t("loginPrompt")}{" "}
          <Link href="/auth/signin?callbackUrl=/seasons" className="text-white underline">{t("login")}</Link>
        </div>
      )}

      {/* Progress */}
      {isAuthenticated && (
        <div className="border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-red-950/40 border border-red-700 flex items-center justify-center font-display text-lg text-red-300">
                {userTier}
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("yourTier")}</div>
                <div className="text-white font-bold">{userTier} / {maxTier}</div>
              </div>
            </div>
            <div className="text-end">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("totalXp")}</div>
              <div className="text-white font-mono font-bold tabular-nums">{fmt(userXp)}</div>
            </div>
          </div>
          <div className="h-2 bg-zinc-900 rounded-sm overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-red-700 to-red-500 transition-all"
              style={{ width: `${tierPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
            <span>Tier {userTier}</span>
            <span>{t("xpToTier", { cur: fmt(xpIntoTier), max: fmt(season.xpPerTier), next: Math.min(maxTier, userTier + 1) })}</span>
          </div>
          {!isPremium && (
            <div className="mt-2 text-[11px] text-zinc-500">
              {t("earnHint")}
            </div>
          )}
        </div>
      )}

      {/* Reward track */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-red-500" />
          {t("rewardsTitle", { count: rewards.length })}
        </h2>
        {tiersWithRewards.length === 0 ? (
          <div className="border border-zinc-900 bg-black/30 p-8 text-center text-zinc-500 text-sm">
            {t("noRewards")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {tiersWithRewards.map((tier) =>
              byTier.get(tier)!.map((r) => {
                const unlocked = userTier >= r.tier;
                const canClaim = isAuthenticated && unlocked && !r.claimed && (!r.premium || isPremium);
                const lockedByPremium = r.premium && !isPremium;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "border p-3 relative overflow-hidden flex flex-col",
                      r.claimed ? "border-green-800 bg-green-950/15" :
                      unlocked && canClaim ? "border-red-700 bg-red-950/15" :
                      "border-zinc-800 bg-black/30",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                        Tier {r.tier}
                      </span>
                      {r.premium && (
                        <span className="text-[8px] font-mono uppercase tracking-widest px-1 py-0.5 border border-yellow-700 bg-yellow-950/30 text-yellow-300">
                          Premium
                        </span>
                      )}
                    </div>
                    <div className="text-2xl mb-1">{r.icon ?? "🎁"}</div>
                    <div className="text-xs text-white font-medium mb-2 flex-1">{r.label}</div>

                    {r.claimed ? (
                      <div className="text-[10px] font-mono uppercase tracking-widest text-green-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t("claimed")}
                      </div>
                    ) : lockedByPremium ? (
                      <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-500 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Premium
                      </div>
                    ) : !unlocked ? (
                      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Tier {r.tier}
                      </div>
                    ) : (
                      <button
                        onClick={() => claim(r.id)}
                        disabled={busy === r.id}
                        className="text-[10px] font-mono uppercase tracking-widest bg-red-700 hover:bg-red-600 text-white px-2 py-1 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t("claim")}
                      </button>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        )}
      </div>

    </div>
  );
}
