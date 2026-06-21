"use client";
// src/components/admin/sections/StreamGoals.tsx — lazily-loaded stream goals + hype train.
import { useState, useEffect, useCallback } from "react";
import { Target, Loader2, Eye, EyeOff, RefreshCw, Trash2, Plus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { GoalBar, HypeTrainBanner } from "@/components/GoalBar";
import { WIDGET_FONTS } from "@/lib/widget-fonts";

type StreamGoalData = {
  id: string;
  type: string;
  label: string;
  current: number;
  target: number;
  active: boolean;
  resetMode: string;
  color: string | null;
  textColor: string | null;
  bgColor: string | null;
  fontFamily: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
};

type HypeTrainData = {
  active: boolean;
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
};

export function StreamGoalsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.streamGoals");
  const nf = useLocale();
  const GOAL_TYPE_LABEL: Record<string, string> = {
    subs: t("goalType.subs"), gift_subs: t("goalType.gift_subs"), follows: t("goalType.follows"),
    donations_pln: t("goalType.donations_pln"), cheers_bits: t("goalType.cheers_bits"), yt_members: t("goalType.yt_members"),
  };
  const RESET_MODE_LABEL: Record<string, string> = {
    manual: t("resetMode.manual"), per_stream: t("resetMode.per_stream"), daily: t("resetMode.daily"),
    weekly: t("resetMode.weekly"), monthly: t("resetMode.monthly"),
  };
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<StreamGoalData[]>([]);
  const [hypeTrain, setHypeTrain] = useState<HypeTrainData | null>(null);
  const [validTypes, setValidTypes] = useState<string[]>([]);
  const [validResetModes, setValidResetModes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form state
  const [newType, setNewType] = useState("subs");
  const [newLabel, setNewLabel] = useState("");
  const [newTarget, setNewTarget] = useState("100");
  const [newColor, setNewColor] = useState("");
  const [newTextColor, setNewTextColor] = useState("");
  const [newBgColor, setNewBgColor] = useState("");
  const [newFont, setNewFont] = useState("");
  const [newResetMode, setNewResetMode] = useState("manual");
  // Hype Train styling (stored on settings, applies to the live banner)
  const [hypeColor, setHypeColor] = useState("");
  const [hypeBgColor, setHypeBgColor] = useState("");
  const [hypeFont, setHypeFont] = useState("");
  const [hypeBusy, setHypeBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ goals?: StreamGoalData[]; hypeTrain?: HypeTrainData | null; validTypes?: string[]; validResetModes?: string[]; hypeStyle?: { color: string | null; bgColor: string | null; fontFamily: string | null } }>("/api/admin/stream-goals");
      setGoals(data.goals ?? []);
      setHypeTrain(data.hypeTrain ?? null);
      setValidTypes(data.validTypes ?? []);
      setValidResetModes(data.validResetModes ?? []);
      setHypeColor(data.hypeStyle?.color ?? "");
      setHypeBgColor(data.hypeStyle?.bgColor ?? "");
      setHypeFont(data.hypeStyle?.fontFamily ?? "");
    } catch { /* keep current */ } finally {
      setLoading(false);
    }
  }, []);

  async function saveHype() {
    setHypeBusy(true);
    const ok = await call("updateHype", {
      hypeColor: hypeColor || null,
      hypeBgColor: hypeBgColor || null,
      hypeFontFamily: hypeFont || null,
    });
    if (ok) { onToast("ok", t("hypeStyleSaved")); await load(); }
    setHypeBusy(false);
  }

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    try {
      await apiPost("/api/admin/stream-goals", { action, ...payload });
      return true;
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
      return false;
    }
  }

  async function createGoal() {
    const target = parseInt(newTarget, 10);
    if (!newLabel.trim() || !target || target < 1) {
      onToast("err", t("createValidation"));
      return;
    }
    setBusy("create");
    const ok = await call("create", {
      type: newType,
      label: newLabel.trim(),
      target,
      color: newColor || undefined,
      textColor: newTextColor || undefined,
      bgColor: newBgColor || undefined,
      fontFamily: newFont || undefined,
      resetMode: newResetMode,
    });
    if (ok) {
      setNewLabel(""); setNewTarget("100"); setNewColor(""); setNewTextColor(""); setNewBgColor(""); setNewFont("");
      onToast("ok", t("created"));
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleActive(g: StreamGoalData) {
    setBusy(g.id);
    if (await call("update", { id: g.id, active: !g.active })) await load();
    setBusy(null);
  }

  async function resetGoal(g: StreamGoalData) {
    if (!confirm(t("resetConfirm", { label: g.label }))) return;
    setBusy(g.id);
    if (await call("reset", { id: g.id })) { onToast("ok", t("reset")); await load(); }
    setBusy(null);
  }

  async function deleteGoal(g: StreamGoalData) {
    if (!confirm(t("deleteConfirm", { label: g.label }))) return;
    setBusy(g.id);
    if (await call("delete", { id: g.id })) { onToast("ok", t("deleted")); await load(); }
    setBusy(null);
  }

  async function bumpCurrent(g: StreamGoalData, delta: number) {
    setBusy(g.id);
    if (await call("update", { id: g.id, current: Math.max(0, g.current + delta) })) await load();
    setBusy(null);
  }

  return (
    <SectionCard title={t("title")} icon={Target}>
      <p className="text-zinc-500 text-xs mb-3">
        {t("intro")}
      </p>

      <div className="mb-4">
        <OverlayPreview path="/overlay/goals" note={t("obsNote")}>
          <GoalBar goal={{ id: "preview1", type: "subs", label: t("previewGoal1"), current: 327, target: 500, color: null, completedAt: null }} accent="#E50914" />
          <GoalBar goal={{ id: "preview2", type: "donations_pln", label: t("previewGoal2"), current: 1500, target: 1500, color: "#10b981", completedAt: new Date().toISOString() }} accent="#E50914" />
        </OverlayPreview>
      </div>

      {/* Hype Train status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
          🚂 Hype Train
        </div>
        {hypeTrain && hypeTrain.active ? (
          <div className="text-sm">
            <span className="text-yellow-300 font-bold">{t("hypeActive")}</span> — Level {hypeTrain.level} ·
            {" "}{hypeTrain.total.toLocaleString(nf)} / {hypeTrain.goal.toLocaleString(nf)} {t("points")}
            {hypeTrain.topContributor && <> · Top: <strong>{hypeTrain.topContributor}</strong></>}
            {hypeTrain.expiresAt && (
              <span className="text-[10px] text-zinc-500 ml-2">
                expiry {new Date(hypeTrain.expiresAt).toLocaleTimeString(nf)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            {t("hypeInactive")} {hypeTrain?.endedAt && <>{t("hypeLast")} Level {hypeTrain.level} ({new Date(hypeTrain.endedAt).toLocaleString(nf)})</>}
            {!hypeTrain && <> {t.rich("hypeSetupNote", { code: (c) => <code>{c}</code> })}</>}
          </div>
        )}

        {/* Hype Train style — color/bg/font for the live banner, with preview */}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">{t("hypeStyleTitle")}</div>
          <div className="mb-2">
            <HypeTrainBanner
              train={{ level: 3, goal: 1000, total: 640, topContributor: "viewer123", expiresAt: null, color: hypeColor || null, bgColor: hypeBgColor || null, fontFamily: hypeFont || null }}
              accent="#E50914"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("colorLabel")}</label>
              <div className="flex items-center gap-1.5">
                <input type="color" value={hypeColor || "#E50914"} onChange={(e) => setHypeColor(e.target.value)} className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer" />
                <input value={hypeColor} onChange={(e) => setHypeColor(e.target.value)} placeholder={t("autoPh")} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("bgColorLabel")}</label>
              <div className="flex items-center gap-1.5">
                <input type="color" value={hypeBgColor || "#140a1e"} onChange={(e) => setHypeBgColor(e.target.value)} className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer" />
                <input value={hypeBgColor} onChange={(e) => setHypeBgColor(e.target.value)} placeholder={t("autoPh")} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("fontLabel")}</label>
              <select value={hypeFont} onChange={(e) => setHypeFont(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
                <option value="">{t("fontDefault")}</option>
                {WIDGET_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={saveHype} disabled={hypeBusy || pending} className="mt-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5">
            {hypeBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null} {t("hypeStyleSave")}
          </button>
        </div>
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {goals.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              {t("empty")}
            </div>
          ) : (
            goals.map((g) => {
              const pct = Math.min(100, (g.current / Math.max(1, g.target)) * 100);
              const color = g.color ?? "#E50914";
              return (
                <div
                  key={g.id}
                  className={cn(
                    "border bg-black/30 p-3",
                    g.active ? "border-zinc-800" : "border-zinc-900 opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border" style={{ borderColor: color, color }}>
                        {GOAL_TYPE_LABEL[g.type] ?? g.type}
                      </span>
                      <span className="text-sm text-white truncate">{g.label}</span>
                      {g.completedAt && (
                        <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">
                          ✓ DONE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => bumpCurrent(g, -1)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center text-xs"
                        title="−1"
                      >−</button>
                      <button
                        onClick={() => bumpCurrent(g, 1)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center text-xs"
                        title="+1"
                      >+</button>
                      <button
                        onClick={() => toggleActive(g)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 h-9 min-w-[36px] inline-flex items-center justify-center text-[9px] font-mono uppercase"
                        title={g.active ? t("disable") : t("enable")}
                        aria-label={g.active ? t("disable") : t("enable")}
                      >
                        {g.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => resetGoal(g)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-orange-400 border border-zinc-800 hover:border-orange-700 w-9 h-9 flex items-center justify-center"
                        title={t("resetTitle")}
                        aria-label={t("resetTitle")}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteGoal(g)}
                        disabled={busy === g.id || pending}
                        className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-9 h-9 flex items-center justify-center"
                        title={t("deleteTitle")}
                        aria-label={t("deleteTitle")}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-sm overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-mono text-white tabular-nums shrink-0">
                      {g.current.toLocaleString(nf)} / {g.target.toLocaleString(nf)}
                      <span className="text-zinc-500 ml-1">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    Reset: {RESET_MODE_LABEL[g.resetMode] ?? g.resetMode}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create new goal */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {t("addGoalTitle")}
        </div>
        {/* Live preview — reflects the colors/font as you build the goal. */}
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">{t("livePreview")}</div>
          <GoalBar
            goal={{
              id: "new-preview",
              type: newType,
              label: newLabel || t("labelPh"),
              current: Math.round((parseInt(newTarget, 10) || 100) * 0.6),
              target: parseInt(newTarget, 10) || 100,
              color: newColor || null,
              textColor: newTextColor || null,
              bgColor: newBgColor || null,
              fontFamily: newFont || null,
              completedAt: null,
            }}
            accent="#E50914"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("typeLabel")}</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            >
              {validTypes.map((ty) => (
                <option key={ty} value={ty}>{GOAL_TYPE_LABEL[ty] ?? ty}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Reset</label>
            <select
              value={newResetMode}
              onChange={(e) => setNewResetMode(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            >
              {validResetModes.map((m) => (
                <option key={m} value={m}>{RESET_MODE_LABEL[m] ?? m}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("labelFieldLabel")}</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("labelPh")}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Target</label>
            <input
              type="number"
              min={1}
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("colorLabel")}</label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={newColor || "#E50914"}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer"
              />
              <input
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                placeholder={t("colorPh")}
                className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("textColorLabel")}</label>
            <div className="flex items-center gap-1.5">
              <input type="color" value={newTextColor || "#a1a1aa"} onChange={(e) => setNewTextColor(e.target.value)} className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer" />
              <input value={newTextColor} onChange={(e) => setNewTextColor(e.target.value)} placeholder={t("autoPh")} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("bgColorLabel")}</label>
            <div className="flex items-center gap-1.5">
              <input type="color" value={newBgColor || "#0f0f14"} onChange={(e) => setNewBgColor(e.target.value)} className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer" />
              <input value={newBgColor} onChange={(e) => setNewBgColor(e.target.value)} placeholder={t("autoPh")} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">{t("fontLabel")}</label>
            <select value={newFont} onChange={(e) => setNewFont(e.target.value)} className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
              <option value="">{t("fontDefault")}</option>
              {WIDGET_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={createGoal}
          disabled={busy === "create" || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          {t("addGoalBtn")}
        </button>
      </div>
    </SectionCard>
  );
}
