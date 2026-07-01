"use client";
// src/components/deck/DeckClient.tsx
// Deck (#774) — big-button live controls: test/custom alerts, quick GT drop codes, and
// subathon time. Reuses the existing admin APIs verbatim (each re-checks permissions), so
// this is purely an ergonomic mobile surface over what the panel can already do.
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Zap, Gift, Timer, Copy, Check, Loader2, Square, ExternalLink } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { TransitionLink as Link } from "@/components/TransitionLink";

type CustomAlert = { id: string; label: string; icon: string | null; accent: string | null };
type Subathon = { active: boolean; endsAt: string | null; label?: string | null };

export function DeckClient() {
  const t = useTranslations("deck");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ k: "ok" | "err"; m: string } | null>(null);
  const [alerts, setAlerts] = useState<CustomAlert[]>([]);
  const [sub, setSub] = useState<Subathon | null>(null);
  const [dropCode, setDropCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const flash = (k: "ok" | "err", m: string) => { setToast({ k, m }); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    apiGet<{ customAlerts: CustomAlert[] }>("/api/admin/custom-alerts").then((d) => setAlerts(d.customAlerts ?? [])).catch(() => {});
    apiGet<{ subathon: Subathon | null }>("/api/admin/subathon").then((d) => setSub(d.subathon)).catch(() => {});
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Tick the subathon countdown while it's live.
  useEffect(() => {
    if (!sub?.active) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [sub?.active]);

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (e) { flash("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(null); }
  }

  const testAlert = () => act("test", async () => {
    await apiPost("/api/admin/alerts", { action: "test" });
    flash("ok", t("fired"));
  });

  const fireCustom = (id: string) => act(`fire-${id}`, async () => {
    await apiPost("/api/admin/custom-alerts", { action: "fire", id });
    flash("ok", t("fired"));
  });

  const quickDrop = (reward: number) => act(`drop-${reward}`, async () => {
    const d = await apiPost<{ ok: boolean; drop?: { code?: string } }>("/api/admin/drops", { reward, expiresInMinutes: 60 });
    if (d.drop?.code) { setDropCode(d.drop.code); setCopied(false); flash("ok", t("created")); }
  });

  const subTime = (minutes: number) => act(`sub-${minutes}`, async () => {
    await apiPost("/api/admin/subathon", { action: "addTime", addMinutes: minutes });
    await load();
  });

  const subStop = () => {
    if (!confirm(t("stopConfirm"))) return;
    void act("sub-stop", async () => {
      await apiPost("/api/admin/subathon", { action: "stop" });
      await load();
    });
  };

  function copyCode() {
    if (!dropCode) return;
    navigator.clipboard?.writeText(dropCode).then(() => setCopied(true)).catch(() => {});
  }

  const subLeft = sub?.active && sub.endsAt ? Math.max(0, new Date(sub.endsAt).getTime() - now) : 0;
  const fmtLeft = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const big = "min-h-16 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest border transition-colors disabled:opacity-40";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">🎛️ {t("title")}</h1>
          <p className="text-xs text-zinc-500 mt-1">{t("subtitle")}</p>
        </div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white border border-zinc-800 px-2.5 py-1.5">
          <ExternalLink className="w-3 h-3" /> {t("openAdmin")}
        </Link>
      </div>

      {/* Alerts */}
      <section>
        <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2"><Zap className="w-3.5 h-3.5 text-red-500" /> {t("alerts")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={testAlert} disabled={!!busy} className={`${big} border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:border-red-600`}>
            {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : "🧪"} {t("testAlert")}
          </button>
          {alerts.map((a) => (
            <button
              key={a.id}
              onClick={() => fireCustom(a.id)}
              disabled={!!busy}
              className={`${big} bg-zinc-900/60 text-zinc-200`}
              style={{ borderColor: a.accent || "#3f3f46" }}
            >
              {busy === `fire-${a.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <span aria-hidden>{a.icon || "⚡"}</span>}
              <span className="truncate">{a.label}</span>
            </button>
          ))}
        </div>
        {alerts.length === 0 && <p className="text-[11px] text-zinc-600 mt-2">{t("noCustom")}</p>}
      </section>

      {/* Quick drop */}
      <section>
        <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2"><Gift className="w-3.5 h-3.5 text-amber-500" /> {t("drop")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {[250, 500, 1000].map((r) => (
            <button key={r} onClick={() => quickDrop(r)} disabled={!!busy} className={`${big} border-amber-800/60 bg-amber-950/20 text-amber-300 hover:border-amber-500`}>
              {busy === `drop-${r}` ? <Loader2 className="w-4 h-4 animate-spin" /> : `${r} GT`}
            </button>
          ))}
        </div>
        {dropCode && (
          <button onClick={copyCode} className="mt-3 w-full border border-amber-600 bg-amber-950/30 px-4 py-4 text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500 mb-1">{t("dropCode")}</div>
            <div className="font-mono text-3xl font-black text-amber-200 tracking-[0.2em] break-all">{dropCode}</div>
            <div className="inline-flex items-center gap-1 mt-2 text-[10px] font-mono uppercase tracking-widest text-amber-500">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? t("copied") : t("copy")}
            </div>
          </button>
        )}
      </section>

      {/* Subathon */}
      <section>
        <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2"><Timer className="w-3.5 h-3.5 text-emerald-500" /> {t("subathon")}</h2>
        {sub?.active ? (
          <>
            <div className="border border-emerald-800/60 bg-emerald-950/20 px-4 py-3 text-center mb-2">
              <div className="font-mono text-4xl font-black text-emerald-300 tabular-nums">{fmtLeft(subLeft)}</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[5, 15, 30].map((m) => (
                <button key={m} onClick={() => subTime(m)} disabled={!!busy} className={`${big} border-emerald-800/60 bg-emerald-950/20 text-emerald-300 hover:border-emerald-500`}>
                  {busy === `sub-${m}` ? <Loader2 className="w-4 h-4 animate-spin" /> : `+${m}m`}
                </button>
              ))}
              <button onClick={() => subTime(-5)} disabled={!!busy} className={`${big} border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500`}>
                {busy === "sub--5" ? <Loader2 className="w-4 h-4 animate-spin" /> : "−5m"}
              </button>
            </div>
            <button onClick={subStop} disabled={!!busy} className={`${big} w-full mt-2 border-red-900/60 bg-red-950/20 text-red-400 hover:border-red-600`}>
              <Square className="w-3.5 h-3.5" /> {t("stop")}
            </button>
          </>
        ) : (
          <p className="text-[11px] text-zinc-600 border border-zinc-900 bg-black/20 px-3 py-3">{t("subOff")}</p>
        )}
      </section>

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-sm font-medium border ${toast.k === "ok" ? "bg-emerald-950 border-emerald-700 text-emerald-300" : "bg-red-950 border-red-700 text-red-300"}`}>
          {toast.m}
        </div>
      )}
    </div>
  );
}
