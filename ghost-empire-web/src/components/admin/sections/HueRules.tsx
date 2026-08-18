"use client";
// src/components/admin/sections/HueRules.tsx
// Reguły oświetlenia Philips Hue per portal (zdarzenie StreamAlert → akcja na lampie).
// Dane przez /api/admin/hue-rules; typy i walidacja współdzielone w lib/hue-rules.ts,
// a wykonawcą jest źródło `obs-control` w OBS (reguły dostarcza /api/obs-control/config).
//
// PO CO ten plik istniał jako brakujące ogniwo: cały łańcuch — model, walidacja, CRUD, dostarczanie
// i wykonawca — był zbudowany i przetestowany, ale nie miał ŻADNEJ powierzchni w panelu, więc
// streamer nie miał jak dodać reguły. To była jedyna luka w gotowej funkcji.
//
// Świadome różnice wobec bliźniaczej sekcji Govee:
//  • BRAK przycisku „testuj" — Hue nie ma endpointu testowego (Govee ma /api/admin/govee-test).
//    Nie udajemy testu, którego nie ma.
//  • BRAK banera „uśpione" — Hue jest realnie wpięte przez źródło obs-control, więc kopiowanie
//    ostrzeżenia od Govee wprowadzałoby w błąd.
//  • Dochodzi `lightId` — Bridge wystawia wiele lamp; puste pole = wszystkie.
import { useState, useEffect, useCallback } from "react";
import { Lightbulb, Loader2, Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { ALERT_TRIGGER_TYPES, ANY_TRIGGER, type HueAction } from "@/lib/hue-rules";
import { useTenantBranding } from "@/components/TenantBranding";

type Rule = {
  id: string;
  enabled: boolean;
  triggerType: string;
  minAmount: number | null;
  lightId: string | null;
  sortOrder: number;
  action: HueAction | null;
};

const KINDS = ["set_color", "set_brightness", "turn"] as const;
type Kind = (typeof KINDS)[number];

export function HueRulesManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.hueRules");
  // Kolor startowy z marki PORTALU, nie z zaszytej czerwieni założyciela.
  const { brandColor } = useTenantBranding();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // formularz dodawania
  const [trigger, setTrigger] = useState<string>("donation");
  const [minAmount, setMinAmount] = useState("");
  const [lightId, setLightId] = useState("");
  const [kind, setKind] = useState<Kind>("set_color");
  const [hex, setHex] = useState(brandColor);
  const [useRevertHex, setUseRevertHex] = useState(false);
  const [revertHex, setRevertHex] = useState("#ffffff");
  const [percent, setPercent] = useState("100");
  const [turnOn, setTurnOn] = useState(true);
  const [revertSec, setRevertSec] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ rules: Rule[] }>("/api/admin/hue-rules");
      setRules(d.rules);
    } catch {
      /* zostaw ostatni znany stan */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function buildAction(): HueAction | null {
    const revertAfterMs = revertSec.trim() ? Math.round(Number(revertSec) * 1000) : null;
    if (kind === "set_color") {
      return { kind, hex, revertHex: useRevertHex ? revertHex : null, revertAfterMs };
    }
    if (kind === "set_brightness") {
      const p = Number(percent);
      if (!Number.isFinite(p)) return null;
      return { kind, percent: Math.max(0, Math.min(100, Math.round(p))), revertAfterMs };
    }
    return { kind, on: turnOn, revertAfterMs };
  }

  async function create() {
    const action = buildAction();
    if (!action) {
      onToast("err", t("incomplete"));
      return;
    }
    setBusy("create");
    try {
      await apiPost("/api/admin/hue-rules", {
        triggerType: trigger,
        minAmount: minAmount.trim() ? Math.round(Number(minAmount)) : null,
        lightId: lightId.trim() || null,
        enabled: true,
        action,
      });
      onToast("ok", t("created"));
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
      await apiPatch("/api/admin/hue-rules", {
        id: r.id,
        enabled: !r.enabled,
        triggerType: r.triggerType,
        minAmount: r.minAmount,
        lightId: r.lightId,
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
      await apiDelete(`/api/admin/hue-rules?id=${encodeURIComponent(r.id)}`);
      onToast("ok", t("deleted"));
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  function describe(a: HueAction | null): string {
    if (!a) return "—";
    if (a.kind === "set_color") return `${t("kindColor")} ${a.hex}${a.revertHex ? ` → ${a.revertHex}` : ""}`;
    if (a.kind === "set_brightness") return `${t("kindBrightness")} ${a.percent}%`;
    return a.on ? t("turnOnLabel") : t("turnOffLabel");
  }

  return (
    <SectionCard title={t("title")} icon={Lightbulb}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {rules.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 border p-2.5 ${r.enabled ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-black/20 opacity-60"}`}>
                {r.action?.kind === "set_color" && (
                  <span className="shrink-0 w-4 h-4 rounded-sm border border-zinc-700" style={{ background: r.action.hex }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    <span className="font-mono text-[11px] text-red-400">{r.triggerType === ANY_TRIGGER ? t("anyTrigger") : r.triggerType}</span>
                    {r.minAmount != null && <span className="text-[10px] text-zinc-500"> ≥ {r.minAmount}</span>}
                    <span className="text-zinc-600"> → </span>
                    <span className="text-zinc-300">{describe(r.action)}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600 flex gap-2 flex-wrap">
                    <span>{r.lightId ? `${t("lightId")}: ${r.lightId}` : t("allLights")}</span>
                    {r.action?.revertAfterMs != null && <span>{t("revertAfter")}: {Math.round(r.action.revertAfterMs / 1000)}s</span>}
                  </div>
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
        <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("lightId")}
          <input value={lightId} placeholder={t("lightIdPh")} onChange={(e) => setLightId(e.target.value)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600" />
          <span className="text-[10px] text-zinc-600">{t("lightIdHint")}</span>
        </label>
        <label className="text-[10px] text-zinc-500 flex flex-col gap-1">{t("action")}
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
            <option value="set_color">{t("kindColor")}</option>
            <option value="set_brightness">{t("kindBrightness")}</option>
            <option value="turn">{t("kindTurn")}</option>
          </select>
        </label>

        {kind === "set_color" && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">{t("color")}
              <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="w-8 h-7 bg-transparent cursor-pointer" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={useRevertHex} onChange={(e) => setUseRevertHex(e.target.checked)} className="accent-red-500" /> {t("flashThenRevert")}
            </label>
            {useRevertHex && (
              <input type="color" value={revertHex} onChange={(e) => setRevertHex(e.target.value)} className="w-8 h-7 bg-transparent cursor-pointer" title={t("revertColor")} />
            )}
          </div>
        )}
        {kind === "set_brightness" && (
          <label className="flex items-center gap-2 text-xs text-zinc-400">{t("brightness")}
            <input type="range" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} className="accent-red-500" />
            <span className="font-mono text-white w-10 text-right">{percent}%</span>
          </label>
        )}
        {kind === "turn" && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={turnOn} onChange={(e) => setTurnOn(e.target.checked)} className="accent-red-500" /> {turnOn ? t("turnOnLabel") : t("turnOffLabel")}
          </label>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
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
