"use client";
// src/components/kasyno/KasynoClient.tsx
// Slots + coinflip played for Ghost Tokens, with a recent-wins / top-net leaderboard.
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type PlayResult = { ok?: boolean; bet: number; payout: number; net: number; newBalance: number; detail: string; reels?: string[]; error?: string };
type Leaderboard = {
  bigWins: Array<{ id: string; name: string; game: string; net: number; detail: string | null }>;
  topNet: Array<{ name: string; net: number }>;
};

export function KasynoClient({ isAuthenticated, initialBalance }: { isAuthenticated: boolean; initialBalance: number | null }) {
  const t = useTranslations("kasyno");
  const gameLabel: Record<string, string> = { slots: t("gameSlots"), coinflip: t("gameCoinflip"), roulette: t("gameRoulette") };
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [rouletteNum, setRouletteNum] = useState("");

  const loadLb = useCallback(async () => {
    try { const r = await fetch("/api/gt-games/leaderboard", { cache: "no-store" }); if (r.ok) setLb(await r.json()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadLb(); }, [loadLb]);

  async function play(game: "slots" | "coinflip" | "roulette", choice?: string) {
    if (busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/gt-games/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, bet, choice }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? t("err")); return; }
      setResult(d); setBalance(d.newBalance); void loadLb();
    } catch { setError(t("connError")); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-black text-white tracking-tight">{t("title")}</h1>
        <p className="text-zinc-400 mt-1 text-sm">{t("subtitlePre")} <code className="text-zinc-500">!slots 100</code> · <code className="text-zinc-500">!coinflip 50</code> · <code className="text-zinc-500">!roulette 100 red</code></p>
      </div>

      {!isAuthenticated ? (
        <Link href="/" className="px-8 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500">{t("loginToPlay")}</Link>
      ) : (
        <>
          {/* result display */}
          <div className="min-h-[64px] flex items-center justify-center">
            {result ? (
              <div className={`text-center ${result.payout > 0 ? "text-emerald-300" : "text-zinc-400"}`}>
                <div className="text-4xl tracking-widest">{result.reels ? result.reels.join(" ") : result.detail}</div>
                <div className="font-bold mt-1">
                  {result.payout > 0 ? `+${result.payout.toLocaleString("pl-PL")} GT 🎉` : `−${result.bet.toLocaleString("pl-PL")} GT`}
                </div>
              </div>
            ) : <div className="text-zinc-700 text-4xl tracking-widest">❔ ❔ ❔</div>}
          </div>
          {error && <div className="text-rose-400 text-sm">{error}</div>}

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">{t("stake")}
              <input type="number" min={10} max={100000} value={bet} onChange={(e) => setBet(Math.max(10, parseInt(e.target.value || "10", 10)))}
                className="ml-2 w-28 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500" />
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => play("slots")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 disabled:opacity-40 transition-all">{t("slots")}</button>
            <button onClick={() => play("coinflip")} disabled={busy || (balance ?? 0) < bet}
              className="px-6 py-3 rounded-full font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 disabled:opacity-40 transition-all">{t("coinflip")}</button>
          </div>

          {/* Roulette: red/black (2×) or a straight number (36×) */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-zinc-500 self-center mr-1">{t("rouletteLabel")}</span>
            <button onClick={() => play("roulette", "red")} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 transition-all">{t("red")}</button>
            <button onClick={() => play("roulette", "black")} disabled={busy || (balance ?? 0) < bet}
              className="px-4 py-2 rounded-full font-bold text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 disabled:opacity-40 transition-all">{t("black")}</button>
            <input type="number" min={0} max={36} value={rouletteNum} onChange={(e) => setRouletteNum(e.target.value)} placeholder="0-36"
              className="w-20 bg-black border border-zinc-700 px-2 py-1.5 text-sm text-white font-mono outline-hidden focus:border-amber-500" />
            <button onClick={() => play("roulette", rouletteNum)} disabled={busy || (balance ?? 0) < bet || !/^\d+$/.test(rouletteNum)}
              className="px-4 py-2 rounded-full font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 disabled:opacity-40 transition-all">{t("number")}</button>
          </div>

          <div className="text-sm text-zinc-400">{t("balance")} <span className="font-bold text-white">{(balance ?? 0).toLocaleString("pl-PL")} GT</span></div>
        </>
      )}

      {/* leaderboard */}
      {lb && (lb.bigWins.length > 0 || lb.topNet.length > 0) && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("bigWins")}</h2>
            <ul className="space-y-1">
              {lb.bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-300 truncate">{w.name} <span className="text-zinc-600">{gameLabel[w.game] ?? w.game}</span></span>
                  <span className="text-emerald-400 font-bold">+{w.net.toLocaleString("pl-PL")}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("topNet")}</h2>
            <ul className="space-y-1">
              {lb.topNet.map((t, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-900 px-3 py-1.5">
                  <span className="text-zinc-300 truncate">{t.name}</span>
                  <span className={t.net >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{t.net >= 0 ? "+" : ""}{t.net.toLocaleString("pl-PL")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
