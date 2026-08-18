"use client";
// src/components/WatchStreakCard.tsx
// Watch Streaks + Loyalty (#687): a daily watch check-in on the homepage. Builds a
// consecutive-day streak, unlocks loyalty tiers, and pays milestone GT (3/7/14/30 =
// 100/300/750/2000). Reuses /api/watch-streak (no new backend per render) and updates
// the header balance instantly via the balance-bus. Mirrors DailyBonusCard, but the
// daily click is about *loyalty status*, not a flat daily payout — GT lands on milestones.
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiGet, apiPost } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { useTenantBranding } from "@/components/TenantBranding";
import { sfxPlay } from "@/lib/sfx";

type Tier = "none" | "bronze" | "silver" | "gold" | "diamond";
type Status = { claimedToday: boolean; streak: number; tier: Tier; nextDays: number | null; nextReward: number | null; freezes: number; protected: boolean };

const TIER_EMOJI: Record<Tier, string> = { none: "🔥", bronze: "🥉", silver: "🥈", gold: "🥇", diamond: "💎" };
// Mirrors WATCH_MILESTONES in lib/watch-streak (kept here to avoid bundling the prisma-importing
// lib into the client — same precedent as DailyBonusCard recomputing its reward formula).
const MILESTONES = [{ days: 3, reward: 100 }, { days: 7, reward: 300 }, { days: 14, reward: 750 }, { days: 30, reward: 2000 }];
const nextOf = (streak: number) => MILESTONES.find((m) => m.days > streak) ?? null;
const FREEZE_COST = 500; // mirrors FREEZE_COST in lib/watch-streak
const FREEZE_MAX = 2; // mirrors FREEZE_MAX_OWNED

export function WatchStreakCard() {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const { tokenSymbol } = useTenantBranding();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyBuy, setBusyBuy] = useState(false);
  const [justReward, setJustReward] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setSt(await apiGet<Status>("/api/watch-streak")); } catch { /* ignore — card just stays hidden */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function claim() {
    if (busy || !st || st.claimedToday) return;
    setBusy(true);
    try {
      const d = await apiPost<{ ok: true; reward: number; streak: number; tier: Tier; newBalance: number; bridged: boolean }>("/api/watch-streak");
      emitBalance(d.newBalance);
      if (d.reward > 0) { sfxPlay("win"); setJustReward(d.reward); }
      const next = nextOf(d.streak);
      // A bridged claim spent one freeze to save the streak — reflect the consumed freeze locally.
      setSt({ claimedToday: true, streak: d.streak, tier: d.tier, nextDays: next?.days ?? null, nextReward: next?.reward ?? null, freezes: d.bridged ? Math.max(0, st.freezes - 1) : st.freezes, protected: false });
    } catch {
      void load(); // 409 (already checked in elsewhere) → refresh
    }
    setBusy(false);
  }

  async function buyFreeze() {
    if (busyBuy || !st || st.freezes >= FREEZE_MAX) return;
    setBusyBuy(true);
    try {
      const d = await apiPost<{ ok: true; freezes: number; newBalance: number }>("/api/streak-freeze");
      emitBalance(d.newBalance);
      setSt({ ...st, freezes: d.freezes });
    } catch { void load(); } // 402/409 → refresh (balance/limit)
    setBusyBuy(false);
  }

  if (!st) return null;
  const tierName = st.tier !== "none" ? t(`wsTier_${st.tier}`) : null;
  return (
    <div className="border border-violet-900/50 bg-gradient-to-r from-violet-950/40 via-zinc-950/60 to-zinc-950/60 clip-corner p-4 flex flex-wrap items-center gap-3">
      <span className="text-2xl">{TIER_EMOJI[st.tier]}</span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg tracking-wider text-white flex items-center gap-2 flex-wrap">
          {t("wsTitle")}
          {tierName && (
            <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-violet-700/60 bg-violet-950/40 text-violet-200">
              {tierName}
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-400 font-mono">
          {t("wsStreak", { days: st.streak })}
          {st.nextDays != null && st.nextReward != null ? (
            <span className="ms-2 text-zinc-500">· +{fmt(st.nextReward)} {tokenSymbol} {t("wsNextIn", { days: st.nextDays - st.streak })}</span>
          ) : (
            <span className="ms-2 text-violet-300">· {t("wsMaxTier")}</span>
          )}
        </div>
        <div className="text-[11px] text-zinc-500 font-mono mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          <span title={t("wsFreezeHint")}>🛡️ {t("wsFreezes", { count: st.freezes })}</span>
          {st.protected && <span className="text-emerald-300">· {t("wsProtected")}</span>}
          {st.freezes < FREEZE_MAX && (
            <button onClick={buyFreeze} disabled={busyBuy} className="underline decoration-dotted underline-offset-2 hover:text-violet-300 disabled:opacity-50">
              {t("wsBuyFreeze")} · {fmt(FREEZE_COST)} {tokenSymbol}
            </button>
          )}
        </div>
      </div>
      {st.claimedToday ? (
        <div className="text-sm font-bold text-emerald-300">
          {justReward != null && justReward > 0 ? `+${fmt(justReward)} ${tokenSymbol} 🎉` : t("wsClaimed")}
        </div>
      ) : (
        <button
          onClick={claim}
          disabled={busy}
          className="px-5 py-2.5 rounded-full text-sm font-extrabold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 disabled:opacity-50 transition-all"
        >
          {t("wsClaim")}
        </button>
      )}
    </div>
  );
}
