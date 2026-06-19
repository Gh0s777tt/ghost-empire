"use client";
// src/components/admin/sections/ClipDirector.tsx
// AI Clip Director (#517): enable hype-clip auto-creation, tune sensitivity, test a
// clip, and see recent auto-clips. Data via /api/admin/clip-director.
import { useState, useEffect, useCallback } from "react";
import { Clapperboard, Loader2, Check, AlertTriangle, ExternalLink, Film } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Clip = { id: string; clipId: string; editUrl: string; reason: string | null; createdAt: string };
type Data = { config: { enabled: boolean; threshold: number; windowSec: number; cooldownSec: number }; scopeOk: boolean; connected: boolean; clips: Clip[] };

export function ClipDirectorManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.clipDirector");
  const nf = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState("10");
  const [windowSec, setWindowSec] = useState("8");
  const [cooldownSec, setCooldownSec] = useState("120");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Data>("/api/admin/clip-director");
      setData(d);
      setEnabled(d.config.enabled); setThreshold(String(d.config.threshold));
      setWindowSec(String(d.config.windowSec)); setCooldownSec(String(d.config.cooldownSec));
    } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy("save");
    try { await apiPost("/api/admin/clip-director", { action: "save", enabled, threshold: +threshold, windowSec: +windowSec, cooldownSec: +cooldownSec }); onToast("ok", t("saved")); await load(); }
    catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    setBusy(null);
  }
  async function test() {
    setBusy("test");
    try { const r = await apiPost<{ clip?: { editUrl: string } }>("/api/admin/clip-director", { action: "test" }); onToast("ok", t("clipped")); if (r.clip) window.open(r.clip.editUrl, "_blank"); await load(); }
    catch (e) { onToast("err", e instanceof ApiError && e.message === "no-clip" ? t("noClip") : t("err")); }
    setBusy(null);
  }

  return (
    <SectionCard title={t("title")} icon={Clapperboard}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {/* Scope status */}
      {data && !data.scopeOk && (
        <div className="flex items-start gap-2 border border-amber-800/60 bg-amber-950/20 p-2.5 mb-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{data.connected ? t("needScope") : t("needConnect")}</span>
        </div>
      )}

      {/* Config */}
      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2.5 mb-3">
        <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-red-600 w-4 h-4" />
          {t("enable")}
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("threshold")} value={threshold} onChange={setThreshold} hint={t("thresholdHint")} />
          <Field label={t("window")} value={windowSec} onChange={setWindowSec} hint="s" />
          <Field label={t("cooldown")} value={cooldownSec} onChange={setCooldownSec} hint="s" />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => void save()} disabled={busy === "save"} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "save" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} {t("save")}
          </button>
          <button onClick={() => void test()} disabled={busy === "test" || (data ? !data.scopeOk : false)} title={data && !data.scopeOk ? t("needScope") : undefined} className="px-3 py-1.5 border border-zinc-700 text-zinc-200 hover:border-red-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === "test" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />} {t("test")}
          </button>
        </div>
      </div>

      {/* Recent auto-clips */}
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("recent")}</div>
      {data && data.clips.length > 0 ? (
        <div className="space-y-1.5">
          {data.clips.map((c) => (
            <a key={c.id} href={c.editUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 hover:border-zinc-600 text-xs">
              <Film className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="font-mono text-zinc-400 truncate flex-1">{c.clipId}</span>
              <span className="text-[10px] text-zinc-600 uppercase">{c.reason}</span>
              <span className="text-[10px] text-zinc-600">{new Date(c.createdAt).toLocaleString(nf)}</span>
              <ExternalLink className="w-3 h-3 text-zinc-500 shrink-0" />
            </a>
          ))}
        </div>
      ) : (
        <div className="text-xs text-zinc-600 text-center py-3 border border-zinc-900 bg-black/20">{t("noClips")}</div>
      )}
    </SectionCard>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] text-zinc-500 block mb-0.5">{label}{hint && <span className="text-zinc-700"> ({hint})</span>}</span>
      <input value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono tabular-nums outline-hidden focus:border-red-600" />
    </label>
  );
}
