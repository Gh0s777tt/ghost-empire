"use client";
// src/components/admin/sections/Subathon.tsx — lazily-loaded subathon manager.
import { useState, useEffect, useCallback } from "react";
import { Hourglass, Loader2, Play } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { SubathonCard } from "@/components/SubathonCard";

type SubathonData = {
  active: boolean;
  endsAt: string | null;
  startedAt: string | null;
  secondsPerSub: number;
  secondsPerPln: number;
  maxEndsAt: string | null;
  totalAddedSecs: number;
  accentColor: string;
  label: string;
};

function subathonHMS(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function SubathonManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.subathon");
  const nf = useLocale();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubathonData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const [minutes, setMinutes] = useState("120");
  const [perSub, setPerSub] = useState("300");
  const [perPln, setPerPln] = useState("60");
  const [maxMinutes, setMaxMinutes] = useState("");
  const [accent, setAccent] = useState("#E50914");
  const [label, setLabel] = useState("Subathon");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/subathon");
      const d = await res.json();
      if (res.ok && d.subathon) {
        setData(d.subathon);
        setPerSub(String(d.subathon.secondsPerSub));
        setPerPln(String(d.subathon.secondsPerPln));
        if (d.subathon.accentColor) setAccent(d.subathon.accentColor);
        if (typeof d.subathon.label === "string") setLabel(d.subathon.label);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const reSync = setInterval(() => void load(), 10_000);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { clearInterval(reSync); clearInterval(tick); };
  }, [load]);

  async function call(action: string, payload: Record<string, unknown>, okMsg: string) {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/subathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast("err", d.error ?? t("err"));
        return;
      }
      if (d.subathon) setData(d.subathon);
      onToast("ok", okMsg);
      onSuccess();
    } finally {
      setBusy(null);
    }
  }

  const remainingMs = data?.active && data.endsAt ? new Date(data.endsAt).getTime() - Date.now() : 0;

  return (
    <SectionCard title="Subathon" icon={Hourglass}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", { b: (c) => <strong>{c}</strong> })}
      </p>

      <div className="mb-4">
        <OverlayPreview path="/overlay/subathon" note={t("obsNote")}>
          <div className="flex justify-center">
            <SubathonCard remainingMs={2 * 3600 * 1000 + 34 * 60 * 1000 + 12 * 1000} ended={false} accent={accent} label={label} />
          </div>
        </OverlayPreview>
      </div>

      {/* Appearance: heading text + accent color (live in the preview above) */}
      <div className="mb-4 border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{t("appearanceTitle")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <label className="text-xs text-zinc-400">{t("timerLabel")}
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder="Subathon"
              className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
            />
          </label>
          <label className="text-xs text-zinc-400">{t("accentLabel")}
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-10 h-9 bg-black border border-zinc-800 cursor-pointer" />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-24 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono focus:border-red-700 outline-hidden"
              />
            </div>
          </label>
          <button
            onClick={() => call("appearance", { accentColor: accent, label }, t("appearanceSaved"))}
            disabled={!!busy || pending}
            className="border border-zinc-700 hover:border-green-600 text-green-300 px-3 py-2 text-xs font-mono uppercase tracking-widest disabled:opacity-50"
          >
            {busy === "appearance" ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t("saveAppearance")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : data?.active ? (
        <div className="space-y-3">
          <div className="border border-red-800 bg-red-950/20 p-4 text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-red-400">{t("remaining")}</div>
            <div className="text-5xl font-black text-white tabular-nums my-1">{subathonHMS(remainingMs)}</div>
            <div className="text-[11px] text-zinc-500">
              {t("endsLabel")} {data.endsAt ? new Date(data.endsAt).toLocaleString(nf) : "—"}
              {" · "}{t("addedTotal", { min: Math.round(data.totalAddedSecs / 60) })}
              {data.maxEndsAt && <> · cap: {new Date(data.maxEndsAt).toLocaleTimeString(nf)}</>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[10, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => call("addTime", { addMinutes: m }, `+${m} min`)}
                disabled={!!busy || pending}
                className="border border-zinc-700 hover:border-green-600 text-green-300 px-3 py-1.5 text-xs font-mono disabled:opacity-50"
              >
                +{m} min
              </button>
            ))}
            <button
              onClick={() => call("addTime", { addMinutes: -10 }, "−10 min")}
              disabled={!!busy || pending}
              className="border border-zinc-700 hover:border-orange-600 text-orange-300 px-3 py-1.5 text-xs font-mono disabled:opacity-50"
            >
              −10 min
            </button>
            <button
              onClick={() => { if (confirm(t("stopConfirm"))) void call("stop", {}, t("stopped")); }}
              disabled={!!busy || pending}
              className="border border-red-800 hover:border-red-600 text-red-300 px-3 py-1.5 text-xs font-mono uppercase tracking-widest disabled:opacity-50 ml-auto"
            >
              Stop
            </button>
          </div>

          <SubathonRates perSub={perSub} perPln={perPln} setPerSub={setPerSub} setPerPln={setPerPln} busy={!!busy || pending}
            onSave={() => call("settings", { secondsPerSub: parseInt(perSub, 10) || 0, secondsPerPln: parseInt(perPln, 10) || 0 }, t("ratesSaved"))} />
        </div>
      ) : (
        <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("startTitle")}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="text-xs text-zinc-400">{t("startMinutes")}
              <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} min={1}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
            <label className="text-xs text-zinc-400">{t("secPerSub")}
              <input type="number" value={perSub} onChange={(e) => setPerSub(e.target.value)} min={0}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
            <label className="text-xs text-zinc-400">{t("secPerPln")}
              <input type="number" value={perPln} onChange={(e) => setPerPln(e.target.value)} min={0}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
            <label className="text-xs text-zinc-400">{t("maxMinutes")}
              <input type="number" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} min={0} placeholder={t("noLimit")}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
          </div>
          <button
            onClick={() => call("start", {
              minutes: parseInt(minutes, 10) || 0,
              secondsPerSub: parseInt(perSub, 10) || 0,
              secondsPerPln: parseInt(perPln, 10) || 0,
              ...(parseInt(maxMinutes, 10) > 0 ? { maxMinutes: parseInt(maxMinutes, 10) } : {}),
            }, t("started"))}
            disabled={!!busy || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "start" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Start
          </button>
        </div>
      )}
    </SectionCard>
  );
}

function SubathonRates({
  perSub, perPln, setPerSub, setPerPln, busy, onSave,
}: {
  perSub: string; perPln: string;
  setPerSub: (v: string) => void; setPerPln: (v: string) => void;
  busy: boolean; onSave: () => void;
}) {
  const t = useTranslations("admin.subathon");
  return (
    <div className="flex flex-wrap items-end gap-2 border border-zinc-900 bg-black/20 p-3">
      <label className="text-xs text-zinc-400">{t("secPerSub")}
        <input type="number" value={perSub} onChange={(e) => setPerSub(e.target.value)} min={0}
          className="w-24 mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden block" />
      </label>
      <label className="text-xs text-zinc-400">{t("secPerPln")}
        <input type="number" value={perPln} onChange={(e) => setPerPln(e.target.value)} min={0}
          className="w-24 mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden block" />
      </label>
      <button onClick={onSave} disabled={busy}
        className="border border-zinc-800 hover:border-zinc-600 text-zinc-300 px-3 py-1.5 text-xs font-mono uppercase tracking-widest disabled:opacity-50">
        {t("saveRates")}
      </button>
    </div>
  );
}
