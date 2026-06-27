"use client";
// src/components/admin/sections/ObsRules.tsx
// PHASE 3C — manage per-portal OBS WebSocket rules (StreamAlert event -> OBS action).
// Data via /api/admin/obs-rules. Dormant until the in-OBS browser-source controller
// (later slice) reads these and actuates OBS. lib/obs-rules.ts holds the shared types.
import { useState, useEffect, useCallback } from "react";
import { MonitorPlay, Loader2, Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { ALERT_TRIGGER_TYPES, ANY_TRIGGER, type ObsAction } from "@/lib/obs-rules";

type Rule = {
  id: string;
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  sortOrder: number;
  action: ObsAction | null;
};

const KINDS = ["switch_scene", "toggle_source", "toggle_filter"] as const;
type Kind = (typeof KINDS)[number];

export function ObsRulesManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.obsRules");
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // create form
  const [trigger, setTrigger] = useState<string>("donation");
  const [minAmount, setMinAmount] = useState("");
  const [kind, setKind] = useState<Kind>("switch_scene");
  const [scene, setScene] = useState("");
  const [source, setSource] = useState("");
  const [filter, setFilter] = useState("");
  const [targetState, setTargetState] = useState(true);
  const [revertSec, setRevertSec] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ rules: Rule[] }>("/api/admin/obs-rules");
      setRules(d.rules);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function buildAction(): ObsAction | null {
    const revertAfterMs = revertSec.trim() ? Math.round(Number(revertSec) * 1000) : null;
    if (kind === "switch_scene") {
      if (!scene.trim()) return null;
      return { kind, scene: scene.trim(), revertAfterMs };
    }
    if (kind === "toggle_source") {
      if (!scene.trim() || !source.trim()) return null;
      return { kind, scene: scene.trim(), source: source.trim(), visible: targetState, revertAfterMs };
    }
    if (!source.trim() || !filter.trim()) return null;
    return { kind, source: source.trim(), filter: filter.trim(), enabled: targetState, revertAfterMs };
  }

  async function create() {
    const action = buildAction();
    if (!action) {
      onToast("err", t("incomplete"));
      return;
    }
    setBusy("create");
    try {
      await apiPost("/api/admin/obs-rules", {
        triggerType: trigger,
        minAmount: minAmount.trim() ? Math.round(Number(minAmount)) : null,
        action,
      });
      onToast("ok", t("created"));
      setScene("");
      setSource("");
      setFilter("");
      setMinAmount("");
      setRevertSec("");
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  async function toggleEnabled(r: Rule) {
    if (!r.action) return;
    setBusy(r.id);
    try {
      await apiPatch("/api/admin/obs-rules", {
        id: r.id,
        enabled: !r.enabled,
        triggerType: r.triggerType,
        minAmount: r.minAmount,
        sortOrder: r.sortOrder,
        action: r.action,
      });
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  async function remove(r: Rule) {
    if (!confirm(t("deleteConfirm"))) return;
    setBusy(r.id);
    try {
      await apiDelete(`/api/admin/obs-rules?id=${encodeURIComponent(r.id)}`);
      onToast("ok", t("deleted"));
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  function describe(a: ObsAction | null): string {
    if (!a) return "—";
    if (a.kind === "switch_scene") return `${t("kindScene")} → "${a.scene}"`;
    if (a.kind === "toggle_source") return `${a.visible ? t("show") : t("hide")} "${a.source}" (${a.scene})`;
    return `${a.enabled ? t("on") : t("off")} ${t("filterWord")} "${a.filter}" → "${a.source}"`;
  }

  const needsScene = kind === "switch_scene" || kind === "toggle_source";
  const needsSource = kind === "toggle_source" || kind === "toggle_filter";
  const needsFilter = kind === "toggle_filter";
  const needsState = kind === "toggle_source" || kind === "toggle_filter";

  return (
    <SectionCard title={t("title")} icon={MonitorPlay}>
      <p className="text-zinc-500 text-xs mb-2">{t("intro")}</p>
      <div className="text-[11px] text-amber-400/80 border border-amber-900/40 bg-amber-950/20 px-2.5 py-1.5 mb-3">{t("dormantNote")}</div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {rules.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 border p-2.5 ${r.enabled ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    <span className="font-mono text-[11px] text-red-400">{r.triggerType === ANY_TRIGGER ? t("anyTrigger") : r.triggerType}</span>
                    {r.minAmount != null && <span className="text-[10px] text-zinc-500"> ≥ {r.minAmount}</span>}
                    <span className="text-zinc-600"> → </span>
                    <span className="text-zinc-300">{describe(r.action)}</span>
                  </div>
                  {r.action?.revertAfterMs != null && <div className="text-[10px] text-zinc-600">{t("revertAfter")}: {Math.round(r.action.revertAfterMs / 1000)}s</div>}
                </div>
                <button onClick={() => void toggleEnabled(r)} disabled={busy === r.id} title={r.enabled ? t("disable") : t("enable")} className="shrink-0 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center">{r.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button>
                <button onClick={() => void remove(r)} disabled={busy === r.id} title={t("deleteTitle")} className="shrink-0 text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("addTitle")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("trigger")}
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
              <option value={ANY_TRIGGER}>{t("anyTrigger")}</option>
              {ALERT_TRIGGER_TYPES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("minAmount")}
            <input value={minAmount} inputMode="numeric" placeholder={t("minAmountPh")} onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9]/g, ""))} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          </label>
        </div>
        <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("action")}
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
            <option value="switch_scene">{t("kindScene")}</option>
            <option value="toggle_source">{t("kindSource")}</option>
            <option value="toggle_filter">{t("kindFilter")}</option>
          </select>
        </label>
        {needsScene && <input value={scene} maxLength={120} placeholder={t("phScene")} onChange={(e) => setScene(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />}
        {needsSource && <input value={source} maxLength={120} placeholder={t("phSource")} onChange={(e) => setSource(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />}
        {needsFilter && <input value={filter} maxLength={120} placeholder={t("phFilter")} onChange={(e) => setFilter(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {needsState && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={targetState} onChange={(e) => setTargetState(e.target.checked)} className="accent-red-500" /> {kind === "toggle_source" ? t("stateVisible") : t("stateEnabled")}
            </label>
          )}
          <input value={revertSec} inputMode="numeric" placeholder={t("revertPh")} onChange={(e) => setRevertSec(e.target.value.replace(/[^0-9]/g, ""))} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600 w-28" />
          <button onClick={() => void create()} disabled={busy === "create"} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} {t("addBtn")}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600">{t("revertHint")}</p>
      </div>
    </SectionCard>
  );
}
