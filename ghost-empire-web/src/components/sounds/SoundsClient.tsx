"use client";
// src/components/sounds/SoundsClient.tsx
// GT sound redemptions (viewer side): spend Ghost Tokens to play a sound on the
// streamer's OBS overlay. Preview locally before you buy. Data via /api/sound-rewards.
import { useState, useEffect, useCallback } from "react";
import { Loader2, Volume2, Play, Coins } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import { ErrorState } from "@/components/EmptyState";
import { signIn } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { useTenantBranding } from "@/components/TenantBranding";

type Reward = { id: string; name: string; emoji: string | null; cost: number; soundUrl: string };
type Data = { rewards: Reward[]; balance: number };

export function SoundsClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("sounds");
  const tc = useTranslations("common");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [loading, setLoading] = useState(isAuthenticated);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ k: "ok" | "err"; m: string } | null>(null);

  const load = useCallback(async () => {
    setErr(false);
    try { setData(await apiGet<Data>("/api/sound-rewards")); }
    catch { setErr(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isAuthenticated) void load(); }, [isAuthenticated, load]);

  function flash(k: "ok" | "err", m: string) { setToast({ k, m }); setTimeout(() => setToast(null), 2800); }
  function preview(url: string) { try { void new Audio(url).play().catch(() => {}); } catch { /* ignore */ } }

  async function redeem(r: Reward) {
    setBusy(r.id);
    try {
      const res = await apiPost<{ newBalance: number }>("/api/sound-rewards", { rewardId: r.id });
      emitBalance(res.newBalance);
      setData((d) => d ? { ...d, balance: res.newBalance } : d);
      preview(r.soundUrl); // play it locally too for instant feedback
      flash("ok", t("redeemed", { name: r.name }));
    } catch (e) { flash("err", e instanceof ApiError ? e.message : t("errGeneric")); }
    setBusy(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2"><Volume2 className="w-6 h-6 text-red-500" /> {t("title")}</h1>
      <p className="text-zinc-500 text-sm mb-6">{t("subtitle")}</p>
      <div className="mb-6 -mt-3"><HowItWorks>{t("help")}</HowItWorks></div>

      {toast && (
        <div className={`mb-4 text-sm px-3 py-2 rounded-lg border ${toast.k === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-red-800/60 bg-red-950/30 text-red-300"}`}>{toast.m}</div>
      )}

      {!isAuthenticated ? (
        <div className="border border-zinc-800 bg-black/40 rounded-xl p-8 text-center">
          <Volume2 className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
          <p className="text-zinc-400 text-sm mb-4">{t("guestText")}</p>
          <button onClick={() => signIn()} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "var(--brand)" }}>{t("login")}</button>
        </div>
      ) : loading ? (
        <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : err ? (
        <ErrorState title={tc("errorTitle")} message={t("errGeneric")} retryLabel={tc("retry")} onRetry={() => { setLoading(true); void load(); }} />
      ) : !data || data.rewards.length === 0 ? (
        <div className="border border-zinc-900 bg-black/20 rounded-xl p-8 text-center">
          <Volume2 className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-400 text-sm">{t("empty")}</p>
        </div>
      ) : (
        <>
          <div className="text-xs text-zinc-500 mb-3 inline-flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-amber-400" /> {t("balance", { n: data.balance.toLocaleString(nf), sym })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.rewards.map((r) => {
              const afford = data.balance >= r.cost;
              return (
                <div key={r.id} className="border border-zinc-800 bg-black/30 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-2xl shrink-0">{r.emoji || "🔊"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-semibold truncate">{r.name}</div>
                    <div className="text-xs font-mono text-amber-300 tabular-nums">{r.cost.toLocaleString(nf)} {sym}</div>
                  </div>
                  <button onClick={() => preview(r.soundUrl)} title={t("preview")} className="shrink-0 w-8 h-8 inline-flex items-center justify-center border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 rounded"><Play className="w-3.5 h-3.5" /></button>
                  <button onClick={() => void redeem(r)} disabled={busy !== null || !afford}
                    className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold tracking-widest uppercase text-white disabled:opacity-50 inline-flex items-center gap-1.5" style={{ background: "var(--brand)" }}>
                    {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />} {afford ? t("playBtn") : t("tooPoor")}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
