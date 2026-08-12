"use client";
// src/components/admin/sections/Penalties.tsx
// Panel „kar za donaty" (#806 / update 2026-08): silnik (src/lib/penalties.ts) już istniał, ale
// nie było go jak włączyć/skonfigurować z UI — ta sekcja to naprawia. Widz wpłaca, a losuje się
// kara (efekt OBS) dla streamera; kwota progowa i katalog są edytowalne per-portal.
//
// ⚠️ BRAMKA PRAWNA: `enabled` domyślnie false. To moduł na REALNE pieniądze (art. 2 ust. 5) —
// panel POKAZUJE ostrzeżenie z API (`legalWarning`) tuż przy przełączniku i NIE pozwala włączyć
// bez zobaczenia go. Konfiguracja ≠ włączenie: budujemy możliwość, decyzja o włączeniu jest
// właściciela po sygnale prawnika. Free-text „wyzwanie" (streamer coś robi, bez akcji OBS) to
// osobny typ — patrz docs/PLAN-UPDATE-2026-08.md (wymaga zmiany silnika + overlaya).
import { useCallback, useEffect, useState } from "react";
import { Gavel, Loader2, Check, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Penalty = {
  id?: string;
  label: string;
  enabled: boolean;
  weight: number;
  minPlnGrosze: number;
  minIntensity: number;
  maxIntensity: number;
  minDurationMs: number;
  maxDurationMs: number;
  actionKind: string;
  scene: string | null;
  source: string | null;
  filter: string | null;
  setting: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  targetState: boolean | null;
  sortOrder: number;
};
type Draw = {
  id: string;
  penaltyLabel: string;
  intensity: number;
  durationMs: number;
  amountGrosze: number;
  currency: string;
  donorName: string | null;
  drawnAt: string;
  appliedAt: string | null;
};
type Config = { enabled: boolean; minPlnGrosze: number; cooldownMs: number };
type Limits = { intensityMax: number; durationMinMs: number; durationMaxMs: number; maxQueue: number };
type Data = {
  config: Config;
  penalties: Penalty[];
  draws: Draw[];
  limits: Limits;
  actionKinds: string[];
  legalWarning: string;
};

function blankPenalty(sortOrder: number): Penalty {
  return {
    label: "", enabled: true, weight: 10, minPlnGrosze: 0,
    minIntensity: 1, maxIntensity: 3, minDurationMs: 3000, maxDurationMs: 10000,
    actionKind: "switch_scene", scene: null, source: null, filter: null,
    setting: null, rangeMin: null, rangeMax: null, targetState: null, sortOrder,
  };
}

export function PenaltiesManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.penalties");
  const nf = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minPln, setMinPln] = useState(20); // w złotych (grosze/100)
  const [cooldownS, setCooldownS] = useState(30); // w sekundach
  const [rows, setRows] = useState<Penalty[]>([]);
  const [savingCfg, setSavingCfg] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Data>("/api/admin/penalties");
      setData(d);
      setEnabled(d.config.enabled);
      setMinPln(Math.round(d.config.minPlnGrosze / 100));
      setCooldownS(Math.round(d.config.cooldownMs / 1000));
      setRows(d.penalties);
    } catch { /* zachowaj bieżący stan */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function patchRow(i: number, patch: Partial<Penalty>) {
    setRows((r) => r.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function saveConfig() {
    setSavingCfg(true);
    try {
      const res = await apiPost<{ ok: boolean; legalWarning: string | null }>("/api/admin/penalties", {
        action: "saveConfig",
        enabled,
        minPlnGrosze: Math.max(100, Math.round(minPln * 100)),
        cooldownMs: Math.max(0, Math.round(cooldownS * 1000)),
      });
      onToast("ok", t("savedConfig"));
      if (res.legalWarning) onToast("err", t("enabledNotice"));
      await load();
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally { setSavingCfg(false); }
  }

  async function savePenalty(i: number) {
    const p = rows[i];
    if (!p.label.trim()) { onToast("err", t("errNoLabel")); return; }
    setSavingId(p.id ?? `new-${i}`);
    try {
      await apiPost("/api/admin/penalties", { action: "savePenalty", penalty: p });
      onToast("ok", t("savedPenalty"));
      await load();
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally { setSavingId(null); }
  }

  async function deletePenalty(i: number) {
    const p = rows[i];
    if (!p.id) { setRows((r) => r.filter((_, idx) => idx !== i)); return; } // niezapisany — usuń lokalnie
    if (!confirm(t("deleteConfirm", { label: p.label }))) return;
    try {
      await apiPost("/api/admin/penalties", { action: "deletePenalty", id: p.id });
      onToast("ok", t("deleted"));
      await load();
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    }
  }

  if (!data) {
    return (
      <SectionCard title={t("title")} icon={Gavel}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }

  const totalWeight = rows.filter((r) => r.enabled).reduce((s, x) => s + Math.max(0, x.weight), 0);

  return (
    <SectionCard title={t("title")} icon={Gavel}>
      <p className="text-zinc-500 text-xs mb-3 leading-relaxed">{t("intro")}</p>

      {/* BRAMKA PRAWNA — ostrzeżenie z serwera, zawsze widoczne przy przełączniku */}
      <div className="mb-4 border border-amber-700/60 bg-amber-950/30 px-3 py-2.5 flex gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/90 leading-relaxed">{data.legalWarning}</p>
      </div>

      {/* config */}
      <div className="flex flex-wrap items-end gap-4 mb-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-amber-600 w-4 h-4" />
          {t("enabledLabel")}
        </label>
        <label className="text-[11px] text-zinc-400 flex items-center gap-2">
          {t("minPlnLabel")}
          <input type="number" min={1} value={minPln} onChange={(e) => setMinPln(Math.max(1, parseInt(e.target.value || "1", 10)))}
            className="w-20 bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-amber-600" />
          <span className="text-zinc-600">zł</span>
        </label>
        <label className="text-[11px] text-zinc-400 flex items-center gap-2">
          {t("cooldownLabel")}
          <input type="number" min={0} value={cooldownS} onChange={(e) => setCooldownS(Math.max(0, parseInt(e.target.value || "0", 10)))}
            className="w-20 bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-amber-600" />
          <span className="text-zinc-600">s</span>
        </label>
      </div>
      <button onClick={saveConfig} disabled={savingCfg || pending}
        className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center gap-2 mb-6">
        {savingCfg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {t("saveConfig")}
      </button>

      {/* katalog kar */}
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">{t("catalogueLabel")}</div>
      <div className="space-y-3 mb-3">
        {rows.map((p, i) => (
          <div key={p.id ?? `new-${i}`} className="border border-zinc-800 bg-black/30 p-3 space-y-2">
            <div className="grid grid-cols-[1fr_64px_80px_36px] gap-2 items-center">
              <input value={p.label} onChange={(e) => patchRow(i, { label: e.target.value })} placeholder={t("phLabel")}
                className="bg-black border border-zinc-800 px-2 py-1 text-sm text-white outline-hidden focus:border-amber-600" />
              <input type="number" min={0} value={p.weight} onChange={(e) => patchRow(i, { weight: Math.max(0, parseInt(e.target.value || "0", 10)) })} title={t("titleWeight")}
                className="bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-amber-600" />
              <input type="number" min={0} value={Math.round(p.minPlnGrosze / 100)} onChange={(e) => patchRow(i, { minPlnGrosze: Math.max(0, parseInt(e.target.value || "0", 10)) * 100 })} title={t("titleMinPln")}
                className="bg-black border border-zinc-800 px-2 py-1 text-sm text-white font-mono outline-hidden focus:border-amber-600" />
              <button onClick={() => deletePenalty(i)} className="text-zinc-500 hover:text-rose-400 flex justify-center" title={t("removeTitle")}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* efekt OBS */}
            <div className="grid grid-cols-2 gap-2">
              <select value={p.actionKind} onChange={(e) => patchRow(i, { actionKind: e.target.value })}
                className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white outline-hidden focus:border-amber-600">
                {data.actionKinds.map((k) => <option key={k} value={k}>{t(`kind_${k}` as never)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <input type="checkbox" checked={p.enabled} onChange={(e) => patchRow(i, { enabled: e.target.checked })} className="accent-amber-600 w-3.5 h-3.5" />
                {t("penaltyEnabled")}
              </label>
              {(p.actionKind === "switch_scene" || p.actionKind === "toggle_source") && (
                <input value={p.scene ?? ""} onChange={(e) => patchRow(i, { scene: e.target.value || null })} placeholder={t("phScene")}
                  className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white outline-hidden focus:border-amber-600" />
              )}
              {(p.actionKind === "toggle_source" || p.actionKind === "toggle_filter" || p.actionKind === "set_filter_intensity") && (
                <input value={p.source ?? ""} onChange={(e) => patchRow(i, { source: e.target.value || null })} placeholder={t("phSource")}
                  className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white outline-hidden focus:border-amber-600" />
              )}
              {(p.actionKind === "toggle_filter" || p.actionKind === "set_filter_intensity") && (
                <input value={p.filter ?? ""} onChange={(e) => patchRow(i, { filter: e.target.value || null })} placeholder={t("phFilter")}
                  className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white outline-hidden focus:border-amber-600" />
              )}
              {p.actionKind === "set_filter_intensity" && (
                <input value={p.setting ?? ""} onChange={(e) => patchRow(i, { setting: e.target.value || null })} placeholder={t("phSetting")}
                  className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white outline-hidden focus:border-amber-600" />
              )}
              {(p.actionKind === "toggle_source" || p.actionKind === "toggle_filter") && (
                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input type="checkbox" checked={!!p.targetState} onChange={(e) => patchRow(i, { targetState: e.target.checked })} className="accent-amber-600 w-3.5 h-3.5" />
                  {p.actionKind === "toggle_source" ? t("stateVisible") : t("stateEnabled")}
                </label>
              )}
              {p.actionKind === "challenge" && (
                <p className="col-span-2 text-[10px] text-amber-300/70 leading-relaxed">{t("challengeHint")}</p>
              )}
            </div>

            {/* pasma intensywności (nie dla „wyzwania") + czasu trwania */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
              {p.actionKind !== "challenge" && (
                <span className="flex items-center gap-1">{t("intensityBand")}
                  <input type="number" min={1} max={data.limits.intensityMax} value={p.minIntensity} onChange={(e) => patchRow(i, { minIntensity: parseInt(e.target.value || "1", 10) })} className="w-12 bg-black border border-zinc-800 px-1 py-0.5 text-white font-mono" />–
                  <input type="number" min={1} max={data.limits.intensityMax} value={p.maxIntensity} onChange={(e) => patchRow(i, { maxIntensity: parseInt(e.target.value || "1", 10) })} className="w-12 bg-black border border-zinc-800 px-1 py-0.5 text-white font-mono" />
                </span>
              )}
              <span className="flex items-center gap-1">{t("durationBand")}
                <input type="number" min={data.limits.durationMinMs} max={data.limits.durationMaxMs} step={500} value={p.minDurationMs} onChange={(e) => patchRow(i, { minDurationMs: parseInt(e.target.value || "0", 10) })} className="w-20 bg-black border border-zinc-800 px-1 py-0.5 text-white font-mono" />–
                <input type="number" min={data.limits.durationMinMs} max={data.limits.durationMaxMs} step={500} value={p.maxDurationMs} onChange={(e) => patchRow(i, { maxDurationMs: parseInt(e.target.value || "0", 10) })} className="w-20 bg-black border border-zinc-800 px-1 py-0.5 text-white font-mono" />
                <span className="text-zinc-600">ms</span>
              </span>
            </div>

            <button onClick={() => savePenalty(i)} disabled={savingId !== null || pending}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 disabled:opacity-50">
              {savingId === (p.id ?? `new-${i}`) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {t("savePenalty")}
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => setRows((r) => [...r, blankPenalty(r.length)])}
        className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 mb-1">
        <Plus className="w-3.5 h-3.5" /> {t("addPenalty")}
      </button>
      {totalWeight > 0 && (
        <p className="text-[10px] text-zinc-600 mb-5">
          {t("chancesPrefix")} {rows.filter((r) => r.enabled).map((p) => `${p.label || "—"} ${((Math.max(0, p.weight) / totalWeight) * 100).toFixed(0)}%`).join(" · ")}
        </p>
      )}

      {/* historia losowań */}
      {data.draws.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-2">{t("drawsTitle")}</div>
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {data.draws.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-xs bg-black/40 border border-zinc-900 px-3 py-1.5">
                <span className="text-zinc-300 truncate">{d.penaltyLabel}</span>
                <span className="text-zinc-500 truncate mx-2">{d.donorName ?? "—"}</span>
                <span className="text-zinc-400 font-mono shrink-0">
                  {(d.amountGrosze / 100).toLocaleString(nf)} {d.currency}
                  {!d.appliedAt && <span className="text-amber-500 ml-1.5" title={t("notApplied")}>●</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
