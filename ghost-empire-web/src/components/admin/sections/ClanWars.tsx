"use client";
// src/components/admin/sections/ClanWars.tsx
// Lazily-loaded admin control for clan wars: start a time-boxed war (name, days,
// prize pool), watch live standings, and end it (top clan by warPoints wins the
// prize into its treasury). Data from /api/admin/clan-wars.
import { useState, useEffect, useCallback } from "react";
import { Swords, Loader2, Crown, Play, Square } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type War = { id: string; name: string; endsAt: string; prizePool: number };
type Standing = { tag: string; name: string; points: number };
type Data = { war: War | null; standings: Standing[] };

function endsInLabel(endsAt: string, t: (k: string, v?: Record<string, number>) => string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return t("overdue");
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? t("endsInD", { d, h: h % 24 }) : t("endsInH", { h });
}

export function ClanWarsManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.clanWars");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState("7");
  const [prize, setPrize] = useState("");

  const load = useCallback(async () => {
    try { setData(await apiGet<Data>("/api/admin/clan-wars")); }
    catch { /* leave empty */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function start() {
    setBusy(true);
    try {
      await apiPost("/api/admin/clan-wars", { action: "start", name: name.trim(), days: parseInt(days || "7", 10), prizePool: parseInt(prize || "0", 10) });
      onToast("ok", t("started")); setName(""); setPrize(""); await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); } finally { setBusy(false); }
  }
  async function end() {
    if (!confirm(t("endConfirm"))) return;
    setBusy(true);
    try {
      const r = await apiPost<{ winnerTag: string | null }>("/api/admin/clan-wars", { action: "end" });
      onToast("ok", r.winnerTag ? t("endedWinner", { tag: r.winnerTag }) : t("endedNoWinner")); await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); } finally { setBusy(false); }
  }

  return (
    <SectionCard title={t("title")} icon={Swords}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : data?.war ? (
        <>
          <div className="border border-amber-700/60 bg-amber-950/20 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-bold text-amber-200 flex items-center gap-1.5"><Swords className="w-4 h-4" /> {data.war.name}</span>
              <span className="text-[11px] font-mono text-amber-300/80">{endsInLabel(data.war.endsAt, t)}</span>
            </div>
            <div className="text-[11px] text-zinc-400">{t("prize")}: <span className="font-mono text-amber-300">{data.war.prizePool.toLocaleString(nf)} {sym}</span></div>
          </div>

          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("standings")}</div>
          {data.standings.length === 0 ? (
            <p className="text-xs text-zinc-600 mb-3">{t("noPoints")}</p>
          ) : (
            <div className="space-y-1 mb-3">
              {data.standings.map((c, i) => (
                <div key={c.tag} className="flex items-center gap-2 text-xs border border-zinc-900 bg-black/20 px-2 py-1.5 rounded">
                  {i === 0 ? <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <span className="w-3.5 text-center text-zinc-500 font-mono shrink-0">{i + 1}</span>}
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold shrink-0" style={{ color: "var(--brand)" }}>{c.tag}</span>
                  <span className="text-zinc-200 truncate flex-1">{c.name}</span>
                  <span className="font-mono tabular-nums text-zinc-400 shrink-0">{c.points.toLocaleString(nf)}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => void end()} disabled={busy}
            className="w-full px-3 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-red-700 text-red-300 hover:border-red-500 disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />} {t("endBtn")}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-zinc-300">{t("startTitle")}</div>
          <input value={name} maxLength={60} placeholder={t("namePh")} onChange={(e) => setName(e.target.value)}
            className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">{t("daysLabel")}
              <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)}
                className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white tabular-nums outline-hidden focus:border-red-600" />
            </label>
            <label className="text-[11px] text-zinc-400">{t("prizeLabel", { sym })}
              <input value={prize} inputMode="numeric" placeholder="0" onChange={(e) => setPrize(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white tabular-nums outline-hidden focus:border-red-600" />
            </label>
          </div>
          <button onClick={() => void start()} disabled={busy}
            className="w-full px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} {t("startBtn")}
          </button>
        </div>
      )}
    </SectionCard>
  );
}
