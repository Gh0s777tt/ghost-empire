"use client";
// src/components/admin/sections/Wheel.tsx
// Configure the Wheel of Fortune: enable it, set the spin cost, and edit the
// weighted segments. Shows house stats + recent spins and the OBS overlay URL.
import { useCallback, useEffect, useState } from "react";
import { Disc3, Loader2, Check, Plus, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { WheelGraphic } from "@/components/WheelGraphic";

type Segment = { label: string; weight: number; rewardTokens: number; color: string };
type Data = {
  enabled: boolean;
  costPerSpin: number;
  segments: Segment[];
  stats: { spins: number; spent: number; paidOut: number };
  recent: Array<{ id: string; name: string; label: string; reward: number; cost: number; at: string }>;
};

const PALETTE = ["#3f3f46", "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

export function WheelManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.wheel");
  const nf = useLocale() === "en" ? "en-US" : "pl-PL";
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cost, setCost] = useState(100);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/wheel");
    if (r.ok) {
      const d: Data = await r.json();
      setData(d);
      setEnabled(d.enabled);
      setCost(d.costPerSpin);
      setSegments(d.segments);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function updateSeg(i: number, patch: Partial<Segment>) {
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, ...patch } : seg)));
  }
  function addSeg() {
    setSegments((s) => [...s, { label: t("segNew"), weight: 10, rewardTokens: 0, color: PALETTE[s.length % PALETTE.length] }]);
  }
  function removeSeg(i: number) {
    setSegments((s) => s.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (segments.length < 2) { onToast("err", t("errMinSegments")); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/wheel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, costPerSpin: cost, segments }),
      });
      const d = await res.json();
      if (!res.ok) { onToast("err", d.error ?? t("err")); return; }
      onToast("ok", t("saved"));
      await load();
      onSuccess();
    } finally { setSaving(false); }
  }

  if (!data) {
    return (
      <SectionCard title={t("title")} icon={Disc3}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }

  const totalWeight = segments.reduce((s, x) => s + Math.max(0, x.weight), 0);
  const houseProfit = data.stats.spent - data.stats.paidOut;

  return (
    <SectionCard title={t("title")} icon={Disc3}>
      <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
        {t.rich("intro", { code: (c) => <code className="text-zinc-400">{c}</code> })}
      </p>

      {/* stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label={t("statSpins")} value={data.stats.spins.toLocaleString(nf)} />
        <Stat label={t("statSpent")} value={data.stats.spent.toLocaleString(nf)} />
        <Stat label={t("statHouse")} value={`${houseProfit >= 0 ? "+" : ""}${houseProfit.toLocaleString(nf)}`} accent={houseProfit >= 0 ? "text-emerald-400" : "text-rose-400"} />
      </div>

      {/* toggle + cost */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-violet-600 w-4 h-4" />
          {t("enabledLabel")}
        </label>
        <label className="text-[11px] text-zinc-400 flex items-center gap-2">
          {t("costLabel")}
          <input type="number" min={0} value={cost} onChange={(e) => setCost(Math.max(0, parseInt(e.target.value || "0", 10)))}
            className="w-24 bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-violet-600" />
        </label>
      </div>

      {/* segments editor */}
      <div className="space-y-2 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">{t("segmentsLabel")}</div>
        {segments.map((seg, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_90px_44px_32px] gap-2 items-center">
            <input value={seg.label} onChange={(e) => updateSeg(i, { label: e.target.value })} placeholder={t("phLabel")}
              className="bg-black border border-zinc-800 px-2 py-1 text-sm text-white outline-hidden focus:border-violet-600" />
            <input type="number" min={1} value={seg.weight} onChange={(e) => updateSeg(i, { weight: Math.max(0, parseInt(e.target.value || "0", 10)) })} title={t("titleWeight")}
              className="bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-violet-600" />
            <input type="number" min={0} value={seg.rewardTokens} onChange={(e) => updateSeg(i, { rewardTokens: Math.max(0, parseInt(e.target.value || "0", 10)) })} title={t("titleReward")}
              className="bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-violet-600" />
            <input type="color" value={seg.color.slice(0, 7)} onChange={(e) => updateSeg(i, { color: e.target.value })}
              className="w-full h-8 bg-black border border-zinc-800 cursor-pointer" />
            <button onClick={() => removeSeg(i)} className="text-zinc-500 hover:text-rose-400 flex justify-center" title={t("removeTitle")}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_70px_90px_44px_32px] gap-2 text-[9px] text-zinc-600 font-mono uppercase px-1">
          <span>{t("phLabel")}</span><span>{t("hdrWeight")}</span><span>{t("hdrReward")}</span><span>{t("hdrColor")}</span><span />
        </div>
        <button onClick={addSeg} className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 mt-1">
          <Plus className="w-3.5 h-3.5" /> {t("addSegment")}
        </button>
        {totalWeight > 0 && (
          <p className="text-[10px] text-zinc-600">
            {t("chancesPrefix")} {segments.map((s) => `${s.label} ${((Math.max(0, s.weight) / totalWeight) * 100).toFixed(1)}%`).join(" · ")}
          </p>
        )}
      </div>

      <button onClick={save} disabled={saving || pending}
        className="w-full px-4 py-2.5 bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-5">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {t("saveWheel")}
      </button>

      {/* OBS preview */}
      <OverlayPreview path="/overlay/wheel" note={t("obsNote")}>
        <div className="flex justify-center py-2">
          <WheelGraphic segments={segments.length >= 2 ? segments : data.segments} rotation={0} size={200} />
        </div>
      </OverlayPreview>

      {/* recent */}
      {data.recent.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">{t("recentTitle")}</div>
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {data.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-xs bg-black/40 border border-zinc-900 px-3 py-1.5">
                <span className="text-zinc-300 truncate">{r.name}</span>
                <span className="text-zinc-500 truncate mx-2">{r.label}</span>
                <span className={r.reward > 0 ? "text-emerald-400 font-bold" : "text-zinc-600"}>
                  {r.reward > 0 ? `+${r.reward.toLocaleString(nf)}` : `−${r.cost.toLocaleString(nf)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-zinc-800 bg-black/30 px-3 py-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`text-lg font-bold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}
