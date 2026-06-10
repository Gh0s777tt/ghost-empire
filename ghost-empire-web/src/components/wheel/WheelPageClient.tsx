"use client";
// src/components/wheel/WheelPageClient.tsx
// Logged-in viewers spend GT to spin. Fetches config + balance, animates the
// wheel to the landed segment returned by the spin API, updates the balance,
// and shows a recent-wins feed.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { Link } from "@/i18n/navigation";
import { WheelGraphic, rotationForIndex, type WheelSeg } from "@/components/WheelGraphic";

const SPIN_MS = 5000; // matches WheelGraphic transition

type WheelState = {
  enabled: boolean;
  costPerSpin: number;
  segments: WheelSeg[];
  balance: number | null;
  recentWins: Array<{ id: string; name: string; label: string; reward: number; at: string }>;
};

type SpinResponse = {
  ok?: boolean;
  segmentIndex: number;
  segmentLabel: string;
  rewardTokens: number;
  cost: number;
  net: number;
  newBalance: number;
  error?: string;
};

export function WheelPageClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("wheel");
  const fmt = useLocaleFmt();
  const [state, setState] = useState<WheelState | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ label: string; reward: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rotationRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wheel", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const spin = useCallback(async () => {
    if (spinning || !state) return;
    setError(null);
    setResult(null);
    setSpinning(true);
    try {
      const res = await fetch("/api/wheel/spin", { method: "POST" });
      const data: SpinResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? t("spinFailed"));
        setSpinning(false);
        return;
      }
      const next = rotationForIndex(rotationRef.current, data.segmentIndex, state.segments.length);
      rotationRef.current = next;
      setRotation(next);
      window.setTimeout(() => {
        setSpinning(false);
        setResult({ label: data.segmentLabel, reward: data.rewardTokens });
        setState((s) => (s ? { ...s, balance: data.newBalance } : s));
        void load(); // refresh recent wins
      }, SPIN_MS);
    } catch {
      setError(t("connError"));
      setSpinning(false);
    }
  }, [spinning, state, load, t]);

  if (!state) {
    return <div className="text-center text-zinc-500 py-20">{t("loading")}</div>;
  }

  const canAfford = (state.balance ?? 0) >= state.costPerSpin;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-black text-white tracking-tight">{t("title")}</h1>
        <p className="text-zinc-400 mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <HowItWorks>{t("help")}</HowItWorks>

      {!state.enabled ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-6 py-10 text-center text-zinc-400">
          {t("disabled")}
        </div>
      ) : (
        <>
          <WheelGraphic segments={state.segments} rotation={rotation} size={340} spinning={spinning} />

          <div className="flex flex-col items-center gap-2">
            {result && (
              <div
                className={`rounded-lg px-5 py-2 text-center font-bold ${
                  result.reward > 0 ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40" : "bg-zinc-800/60 text-zinc-300 border border-zinc-700"
                }`}
              >
                {result.reward > 0 ? t("won", { reward: fmt(result.reward), label: result.label }) : t("tryAgain", { label: result.label })}
              </div>
            )}
            {error && <div className="text-rose-400 text-sm">{error}</div>}

            {isAuthenticated ? (
              <>
                <button
                  onClick={spin}
                  disabled={spinning || !canAfford}
                  className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/40"
                >
                  {spinning ? t("spinning") : t("spinCost", { cost: fmt(state.costPerSpin) })}
                </button>
                <div className="text-sm text-zinc-400">
                  {t("balance")} <span className="font-bold text-white">{fmt(state.balance ?? 0)} GT</span>
                  {!canAfford && <span className="text-rose-400 ms-2">{t("cantAfford")}</span>}
                </div>
              </>
            ) : (
              <Link href="/" className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 transition-all">
                {t("loginToPlay")}
              </Link>
            )}
          </div>

          {state.recentWins.length > 0 && (
            <div className="w-full max-w-md mt-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("recentWins")}</h2>
              <ul className="space-y-1">
                {state.recentWins.map((w) => (
                  <li key={w.id} className="flex items-center justify-between text-sm rounded-md bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                    <span className="text-zinc-300 font-medium truncate">{w.name}</span>
                    <span className="text-emerald-400 font-bold">+{fmt(w.reward)} GT</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
