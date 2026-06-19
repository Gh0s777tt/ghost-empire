"use client";
// src/components/DailyBonusButton.tsx
// Header indicator that lets a logged-in user claim the daily bonus from ANY page
// (the full card only lives on the homepage). Shows ONLY when a claim is available
// — a pulsing gift — so it nudges without nagging. Reuses /api/daily-bonus (no new
// backend) and stays in sync with the homepage card via the daily-bus.
import { useState, useEffect, useCallback } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { apiGet, apiPost } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { emitDailyClaimed, DAILY_CLAIMED_EVENT } from "@/lib/daily-bus";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { sfxPlay } from "@/lib/sfx";

type Status = { claimedToday: boolean; streak: number; nextReward: number };

export function DailyBonusButton() {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const pathname = usePathname();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setSt(await apiGet<Status>("/api/daily-bonus")); } catch { /* ignore — indicator just stays hidden */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Sync with the homepage card: if it claims, reflect that here (the header is
  // persistent across navigations, so it won't refetch on its own).
  useEffect(() => {
    const onClaimed = (e: Event) =>
      setSt((s) => (s ? { ...s, claimedToday: true, streak: (e as CustomEvent<number>).detail } : s));
    window.addEventListener(DAILY_CLAIMED_EVENT, onClaimed);
    return () => window.removeEventListener(DAILY_CLAIMED_EVENT, onClaimed);
  }, []);

  async function claim() {
    if (busy || !st || st.claimedToday) return;
    setBusy(true);
    try {
      const d = await apiPost<{ reward: number; streak: number; newBalance: number }>("/api/daily-bonus");
      emitBalance(d.newBalance);
      emitDailyClaimed(d.streak);
      sfxPlay("win");
      setSt({ claimedToday: true, streak: d.streak, nextReward: Math.min(50 + 25 * d.streak, 200) });
    } catch {
      void load(); // 409 (claimed elsewhere) → refresh
    }
    setBusy(false);
  }

  // Nudge only when there's something to claim, and not on the homepage (the card is there).
  if (!st || st.claimedToday || pathname === "/") return null;

  return (
    <button
      onClick={claim}
      disabled={busy}
      title={t("bonusClaim", { amount: fmt(st.nextReward) })}
      aria-label={t("bonusClaim", { amount: fmt(st.nextReward) })}
      className="relative w-8 h-8 inline-flex items-center justify-center border border-amber-700/70 text-amber-300 hover:border-amber-400 hover:text-amber-200 transition-colors"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
      {!busy && <span className="absolute -top-1 -end-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse ring-2 ring-black" />}
    </button>
  );
}
